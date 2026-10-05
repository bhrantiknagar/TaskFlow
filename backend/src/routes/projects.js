const express = require('express');
const mongoose = require('mongoose');
const authenticate = require('../middleware/authenticate');
const { Project, projectStatuses } = require('../models/Project');
const { User } = require('../models/User');

const router = express.Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const fields = new Set(['name', 'description', 'startDate', 'deadline', 'status']);
const memberPopulation = { path: 'members', select: 'name email role' };
const ownerPopulation = { path: 'owner', select: 'name email role' };

router.use(authenticate);

const validId = value => mongoose.isValidObjectId(value);
const escapedRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sameId = (a, b) => String(a?._id || a) === String(b?._id || b);
const isMember = (project, userId) => project.members.some(member => sameId(member, userId));
const canView = (project, user) => user.role === 'Admin' || sameId(project.owner, user.id) || isMember(project, user.id);
const canManage = (project, user) => user.role === 'Admin' || sameId(project.owner, user.id) || (user.role === 'Project Manager' && isMember(project, user.id));

function serializeProject(project, user) {
  const owner = project.owner && typeof project.owner === 'object' ? {
    id: String(project.owner._id), name: project.owner.name, email: project.owner.email, role: project.owner.role
  } : project.owner;
  const members = (project.members || []).map(member => typeof member === 'object' ? {
    id: String(member._id), name: member.name, email: member.email, role: member.role
  } : String(member));
  return {
    id: String(project._id), name: project.name, description: project.description,
    owner, members, startDate: project.startDate, deadline: project.deadline,
    status: project.status, createdAt: project.createdAt, updatedAt: project.updatedAt,
    canManage: canManage(project, user)
  };
}

function parseProjectFields(body, { create = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Request body must be a JSON object.' };
  const unknown = Object.keys(body).filter(key => !fields.has(key));
  if (unknown.length) return { error: `Unsupported project field: ${unknown[0]}.` };
  if (!create && !Object.keys(body).length) return { error: 'Provide at least one project field to update.' };

  const values = {};
  const errors = [];
  if ('name' in body) {
    if (typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.trim().length > 120) errors.push('Project name must be between 2 and 120 characters.');
    else values.name = body.name.trim();
  } else if (create) errors.push('Project name is required.');
  if ('description' in body) {
    if (typeof body.description !== 'string' || body.description.trim().length > 2000) errors.push('Description must be no more than 2000 characters.');
    else values.description = body.description.trim();
  }
  if ('status' in body) {
    if (typeof body.status !== 'string' || !projectStatuses.includes(body.status)) errors.push(`Status must be one of: ${projectStatuses.join(', ')}.`);
    else values.status = body.status;
  }
  for (const key of ['startDate', 'deadline']) {
    if (!(key in body)) continue;
    if (body[key] === null || body[key] === '') { values[key] = null; continue; }
    if (typeof body[key] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body[key])) {
      errors.push(`${key === 'startDate' ? 'Start date' : 'Deadline'} must use YYYY-MM-DD format.`);
      continue;
    }
    const date = new Date(`${body[key]}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== body[key]) {
      errors.push(`${key === 'startDate' ? 'Start date' : 'Deadline'} is not a valid calendar date.`);
      continue;
    }
    values[key] = date;
  }
  if (errors.length) return { error: errors[0], details: errors };
  return { values };
}

function validateDateOrder(project) {
  if (project.startDate && project.deadline && project.deadline < project.startDate) {
    return 'Deadline must be on or after the start date.';
  }
  return null;
}

async function loadProject(id) {
  return Project.findById(id).populate(ownerPopulation).populate(memberPopulation);
}

router.get('/', async (req, res, next) => {
  try {
    const { q = '', status } = req.query;
    if (typeof q !== 'string' || q.length > 100) return res.status(400).json({ error: 'Search text must be no more than 100 characters.' });
    if (status !== undefined && (typeof status !== 'string' || !projectStatuses.includes(status))) {
      return res.status(400).json({ error: `Status must be one of: ${projectStatuses.join(', ')}.` });
    }
    const access = req.user.role === 'Admin' ? {} : { $or: [{ owner: req.user.id }, { members: req.user.id }] };
    const filters = [access];
    if (status) filters.push({ status });
    const query = q.trim();
    if (query) {
      const search = new RegExp(escapedRegex(query), 'i');
      filters.push({ $or: [{ name: search }, { description: search }] });
    }
    const projects = await Project.find(filters.length > 1 ? { $and: filters } : filters[0])
      .sort({ updatedAt: -1 }).populate(ownerPopulation).populate(memberPopulation);
    return res.json({ projects: projects.map(project => serializeProject(project, req.user)) });
  } catch (error) { return next(error); }
});

router.post('/', async (req, res, next) => {
  try {
    const parsed = parseProjectFields(req.body, { create: true });
    if (parsed.error) return res.status(400).json(parsed);
    const values = { ...parsed.values, owner: req.user.id };
    const dateError = validateDateOrder(values);
    if (dateError) return res.status(400).json({ error: dateError });
    const project = await Project.create(values);
    const saved = await loadProject(project.id);
    return res.status(201).json({ project: serializeProject(saved, req.user) });
  } catch (error) { return next(error); }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid project id.' });
    const project = await loadProject(req.params.id);
    if (!project || !canView(project, req.user)) return res.status(404).json({ error: 'Project not found.' });
    return res.json({ project: serializeProject(project, req.user) });
  } catch (error) { return next(error); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid project id.' });
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    if (!canManage(project, req.user)) return res.status(403).json({ error: 'You do not have permission to edit this project.' });
    const parsed = parseProjectFields(req.body);
    if (parsed.error) return res.status(400).json(parsed);
    const combined = { ...project.toObject(), ...parsed.values };
    const dateError = validateDateOrder(combined);
    if (dateError) return res.status(400).json({ error: dateError });
    Object.assign(project, parsed.values);
    await project.save();
    const saved = await loadProject(project.id);
    return res.json({ project: serializeProject(saved, req.user) });
  } catch (error) { return next(error); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid project id.' });
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    if (!canManage(project, req.user)) return res.status(403).json({ error: 'You do not have permission to delete this project.' });
    await project.deleteOne();
    return res.status(200).json({ message: 'Project deleted.' });
  } catch (error) { return next(error); }
});

router.post('/:id/members', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid project id.' });
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    if (!canManage(project, req.user)) return res.status(403).json({ error: 'You do not have permission to manage project members.' });
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!email || email.length > 254 || !emailPattern.test(email)) return res.status(400).json({ error: 'Enter a valid member email address.' });
    const member = await User.findOne({ email }).select('name email role');
    if (!member) return res.status(404).json({ error: 'No TaskFlow account was found for that email.' });
    if (sameId(project.owner, member.id)) return res.status(409).json({ error: 'The project owner already has access.' });
    if (isMember(project, member.id)) return res.status(409).json({ error: 'This user is already a project member.' });
    if (project.members.length >= 100) return res.status(400).json({ error: 'A project can have no more than 100 members.' });
    const added = await Project.updateOne({ _id: project.id, members: { $ne: member.id } }, { $addToSet: { members: member.id } });
    if (!added.modifiedCount) return res.status(409).json({ error: 'This user is already a project member.' });
    const saved = await loadProject(project.id);
    return res.status(201).json({ project: serializeProject(saved, req.user) });
  } catch (error) { return next(error); }
});

router.delete('/:id/members/:userId', async (req, res, next) => {
  try {
    if (!validId(req.params.id) || !validId(req.params.userId)) return res.status(400).json({ error: 'Invalid project or user id.' });
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    if (!canManage(project, req.user)) return res.status(403).json({ error: 'You do not have permission to manage project members.' });
    if (sameId(project.owner, req.params.userId)) return res.status(409).json({ error: 'The project owner cannot be removed.' });
    if (!isMember(project, req.params.userId)) return res.status(404).json({ error: 'Project member not found.' });
    project.members = project.members.filter(member => !sameId(member, req.params.userId));
    await project.save();
    const saved = await loadProject(project.id);
    return res.json({ project: serializeProject(saved, req.user) });
  } catch (error) { return next(error); }
});

module.exports = router;
