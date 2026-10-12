const express = require('express');
const mongoose = require('mongoose');
const authenticate = require('../middleware/authenticate');
const { canViewProject, canManageProject, isProjectParticipant, sameId } = require('../middleware/projectAccess');
const { Project } = require('../models/Project');
const { Task, priorities, taskStatuses } = require('../models/Task');
const { User } = require('../models/User');

const router = express.Router();
const taskFields = new Set(['title', 'description', 'project', 'assignee', 'priority', 'status', 'dueDate', 'subtasks']);
const populated = query => query.populate({ path: 'project', select: 'name owner members', populate: [{ path: 'owner', select: 'name email role' }, { path: 'members', select: 'name email role' }] }).populate({ path: 'assignee', select: 'name email role' }).populate({ path: 'createdBy', select: 'name email role' });

router.use(authenticate);

function validId(value) { return mongoose.isValidObjectId(value); }
function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function parseDate(value, label) {
  if (value === null || value === '') return { value: null };
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return { error: `${label} must use YYYY-MM-DD format.` };
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return { error: `${label} is not a valid calendar date.` };
  return { value: date };
}
function parseSubtasks(input) {
  if (!Array.isArray(input) || input.length > 50) return { error: 'Subtasks must be a list of no more than 50 items.' };
  const values = [];
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { error: 'Each subtask must be an object.' };
    const keys = Object.keys(item);
    if (keys.some(key => !['title', 'completed'].includes(key))) return { error: 'Subtasks only support title and completed fields.' };
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    if (title.length < 2 || title.length > 160) return { error: 'Subtask titles must be between 2 and 160 characters.' };
    if ('completed' in item && typeof item.completed !== 'boolean') return { error: 'Subtask completed must be true or false.' };
    values.push({ title, completed: item.completed === true });
  }
  return { values };
}
async function accessibleProject(projectId, user) {
  if (!validId(projectId)) return { error: 'Invalid project id.', status: 400 };
  const project = await Project.findById(projectId).populate('owner', 'name email role').populate('members', 'name email role');
  if (!project || !canViewProject(project, user)) return { error: 'Project not found.', status: 404 };
  return { project };
}
async function accessibleTask(taskId, user) {
  if (!validId(taskId)) return { error: 'Invalid task id.', status: 400 };
  const task = await populated(Task.findById(taskId));
  if (!task || !task.project || !canViewProject(task.project, user)) return { error: 'Task not found.', status: 404 };
  return { task };
}
function serializeTask(task, user) {
  const project = task.project;
  const manager = canManageProject(project, user);
  const assignee = task.assignee ? { id: String(task.assignee._id), name: task.assignee.name, email: task.assignee.email } : null;
  const projectInfo = { id: String(project._id), name: project.name };
  return {
    id: String(task._id), title: task.title, description: task.description,
    project: projectInfo, assignee, createdBy: task.createdBy ? { id: String(task.createdBy._id), name: task.createdBy.name } : null,
    priority: task.priority, status: task.status, dueDate: task.dueDate,
    subtasks: task.subtasks.map(subtask => ({ id: String(subtask._id), title: subtask.title, completed: subtask.completed })),
    createdAt: task.createdAt, updatedAt: task.updatedAt,
    canManage: manager, canEdit: manager || sameId(task.assignee, user.id)
  };
}
function parseTaskFields(body, { create = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Request body must be a JSON object.' };
  const unknown = Object.keys(body).filter(key => !taskFields.has(key));
  if (unknown.length) return { error: `Unsupported task field: ${unknown[0]}.` };
  if (!create && !Object.keys(body).length) return { error: 'Provide at least one task field to update.' };
  const values = {};
  const errors = [];
  if ('title' in body) {
    if (typeof body.title !== 'string' || body.title.trim().length < 2 || body.title.trim().length > 160) errors.push('Task title must be between 2 and 160 characters.');
    else values.title = body.title.trim();
  } else if (create) errors.push('Task title is required.');
  if ('description' in body) {
    if (typeof body.description !== 'string' || body.description.trim().length > 3000) errors.push('Description must be no more than 3000 characters.');
    else values.description = body.description.trim();
  }
  if ('priority' in body) {
    if (!priorities.includes(body.priority)) errors.push(`Priority must be one of: ${priorities.join(', ')}.`);
    else values.priority = body.priority;
  }
  if ('status' in body) {
    if (!taskStatuses.includes(body.status)) errors.push(`Status must be one of: ${taskStatuses.join(', ')}.`);
    else values.status = body.status;
  }
  if ('dueDate' in body) {
    const parsed = parseDate(body.dueDate, 'Due date');
    if (parsed.error) errors.push(parsed.error); else values.dueDate = parsed.value;
  }
  if ('subtasks' in body) {
    const parsed = parseSubtasks(body.subtasks);
    if (parsed.error) errors.push(parsed.error); else values.subtasks = parsed.values;
  }
  if (errors.length) return { error: errors[0], details: errors };
  return { values };
}
async function parseAssignee(rawId, project) {
  if (rawId === null || rawId === '') return { value: null };
  if (typeof rawId !== 'string' || !validId(rawId)) return { error: 'Assignee must be a valid project member id.' };
  if (!isProjectParticipant(project, rawId)) return { error: 'Assignee must be the project owner or a project member.' };
  const user = await User.findById(rawId).select('name email role');
  if (!user) return { error: 'Assignee account was not found.' };
  return { value: user._id };
}

router.get('/', async (req, res, next) => {
  try {
    const { q = '', status, priority, project, assignee } = req.query;
    if (typeof q !== 'string' || q.length > 100) return res.status(400).json({ error: 'Search text must be no more than 100 characters.' });
    if (status !== undefined && !taskStatuses.includes(status)) return res.status(400).json({ error: `Status must be one of: ${taskStatuses.join(', ')}.` });
    if (priority !== undefined && !priorities.includes(priority)) return res.status(400).json({ error: `Priority must be one of: ${priorities.join(', ')}.` });
    if (project !== undefined && !validId(project)) return res.status(400).json({ error: 'Invalid project id.' });
    if (assignee !== undefined && assignee !== 'unassigned' && !validId(assignee)) return res.status(400).json({ error: 'Invalid assignee id.' });
    const projectQuery = req.user.role === 'Admin' ? {} : { $or: [{ owner: req.user.id }, { members: req.user.id }] };
    const accessibleIds = (await Project.find(projectQuery).select('_id')).map(item => item._id);
    if (project && !accessibleIds.some(id => sameId(id, project))) return res.status(404).json({ error: 'Project not found.' });
    if (!accessibleIds.length && req.user.role !== 'Admin') return res.json({ tasks: [] });
    const filters = [{ project: project ? new mongoose.Types.ObjectId(project) : { $in: accessibleIds } }];
    if (status) filters.push({ status });
    if (priority) filters.push({ priority });
    if (assignee === 'unassigned') filters.push({ assignee: null });
    else if (assignee) filters.push({ assignee: new mongoose.Types.ObjectId(assignee) });
    const search = q.trim();
    if (search) { const regex = new RegExp(escapeRegex(search), 'i'); filters.push({ $or: [{ title: regex }, { description: regex }] }); }
    const tasks = await populated(Task.find({ $and: filters }).sort({ updatedAt: -1 }));
    return res.json({ tasks: tasks.filter(task => task.project && canViewProject(task.project, req.user)).map(task => serializeTask(task, req.user)) });
  } catch (error) { return next(error); }
});

router.post('/', async (req, res, next) => {
  try {
    const parsed = parseTaskFields(req.body, { create: true });
    if (parsed.error) return res.status(400).json(parsed);
    const projectAccess = await accessibleProject(req.body.project, req.user);
    if (projectAccess.error) return res.status(projectAccess.status).json({ error: projectAccess.error });
    const project = projectAccess.project;
    if (!canManageProject(project, req.user)) return res.status(403).json({ error: 'You do not have permission to create tasks in this project.' });
    let assignee = { value: null };
    if ('assignee' in req.body) assignee = await parseAssignee(req.body.assignee, project);
    if (assignee.error) return res.status(400).json({ error: assignee.error });
    const task = await Task.create({ ...parsed.values, project: project._id, assignee: assignee.value, createdBy: req.user.id });
    const saved = await accessibleTask(task.id, req.user);
    return res.status(201).json({ task: serializeTask(saved.task, req.user) });
  } catch (error) { return next(error); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const result = await accessibleTask(req.params.id, req.user);
    if (result.error) return res.status(result.status).json({ error: result.error });
    return res.json({ task: serializeTask(result.task, req.user) });
  } catch (error) { return next(error); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const result = await accessibleTask(req.params.id, req.user);
    if (result.error) return res.status(result.status).json({ error: result.error });
    const task = result.task;
    const manager = canManageProject(task.project, req.user);
    const assigned = sameId(task.assignee, req.user.id);
    if (!manager && Object.keys(req.body || {}).some(key => key !== 'status')) return res.status(403).json({ error: 'Assignees can only update task status.' });
    if (!manager && !assigned) return res.status(403).json({ error: 'You do not have permission to edit this task.' });
    const parsed = parseTaskFields(req.body);
    if (parsed.error) return res.status(400).json(parsed);
    const targetProjectId = req.body.project || String(task.project._id);
    let targetProject = task.project;
    if (String(targetProjectId) !== String(task.project._id)) {
      const access = await accessibleProject(targetProjectId, req.user);
      if (access.error) return res.status(access.status).json({ error: access.error });
      if (!manager || !canManageProject(access.project, req.user)) return res.status(403).json({ error: 'You do not have permission to move tasks to this project.' });
      targetProject = access.project;
    }
    if ('assignee' in req.body) {
      const assignee = await parseAssignee(req.body.assignee, targetProject);
      if (assignee.error) return res.status(400).json({ error: assignee.error });
      parsed.values.assignee = assignee.value;
    } else if (String(targetProjectId) !== String(task.project._id) && task.assignee) {
      const assignee = await parseAssignee(String(task.assignee._id), targetProject);
      if (assignee.error) return res.status(400).json({ error: 'The current assignee is not a member of the target project; reassign or clear the assignee first.' });
    }
    if ('project' in req.body) parsed.values.project = targetProject._id;
    await Task.updateOne({ _id: task._id }, { $set: parsed.values });
    const saved = await accessibleTask(task.id, req.user);
    return res.json({ task: serializeTask(saved.task, req.user) });
  } catch (error) { return next(error); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await accessibleTask(req.params.id, req.user);
    if (result.error) return res.status(result.status).json({ error: result.error });
    if (!canManageProject(result.task.project, req.user)) return res.status(403).json({ error: 'You do not have permission to delete this task.' });
    await Task.deleteOne({ _id: result.task._id });
    return res.status(200).json({ message: 'Task deleted.' });
  } catch (error) { return next(error); }
});

router.post('/:id/subtasks', async (req, res, next) => {
  try {
    const result = await accessibleTask(req.params.id, req.user);
    if (result.error) return res.status(result.status).json({ error: result.error });
    if (!canManageProject(result.task.project, req.user)) return res.status(403).json({ error: 'You do not have permission to add subtasks.' });
    const parsed = parseSubtasks([req.body]);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    if (result.task.subtasks.length >= 50) return res.status(400).json({ error: 'A task can have no more than 50 subtasks.' });
    const task = await Task.findById(result.task._id);
    task.subtasks.push(parsed.values[0]);
    await task.save();
    const saved = await accessibleTask(task.id, req.user);
    return res.status(201).json({ task: serializeTask(saved.task, req.user) });
  } catch (error) { return next(error); }
});

router.patch('/:id/subtasks/:subtaskId', async (req, res, next) => {
  try {
    const result = await accessibleTask(req.params.id, req.user);
    if (result.error) return res.status(result.status).json({ error: result.error });
    const task = result.task;
    const manager = canManageProject(task.project, req.user);
    const assigned = sameId(task.assignee, req.user.id);
    if (!manager && !assigned) return res.status(403).json({ error: 'You do not have permission to update subtasks.' });
    if (!validId(req.params.subtaskId)) return res.status(400).json({ error: 'Invalid subtask id.' });
    const item = task.subtasks.id(req.params.subtaskId);
    if (!item) return res.status(404).json({ error: 'Subtask not found.' });
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length) return res.status(400).json({ error: 'Provide subtask fields to update.' });
    if (Object.keys(body).some(key => !['title', 'completed'].includes(key))) return res.status(400).json({ error: 'Subtasks only support title and completed fields.' });
    if (!manager && Object.keys(body).some(key => key !== 'completed')) return res.status(403).json({ error: 'Assignees can only mark subtasks complete or incomplete.' });
    if ('title' in body) {
      if (typeof body.title !== 'string' || body.title.trim().length < 2 || body.title.trim().length > 160) return res.status(400).json({ error: 'Subtask titles must be between 2 and 160 characters.' });
      item.title = body.title.trim();
    }
    if ('completed' in body) {
      if (typeof body.completed !== 'boolean') return res.status(400).json({ error: 'Subtask completed must be true or false.' });
      item.completed = body.completed;
    }
    await task.save();
    const saved = await accessibleTask(task.id, req.user);
    return res.json({ task: serializeTask(saved.task, req.user) });
  } catch (error) { return next(error); }
});

router.delete('/:id/subtasks/:subtaskId', async (req, res, next) => {
  try {
    const result = await accessibleTask(req.params.id, req.user);
    if (result.error) return res.status(result.status).json({ error: result.error });
    if (!canManageProject(result.task.project, req.user)) return res.status(403).json({ error: 'You do not have permission to remove subtasks.' });
    if (!validId(req.params.subtaskId)) return res.status(400).json({ error: 'Invalid subtask id.' });
    const task = await Task.findById(result.task._id);
    const item = task.subtasks.id(req.params.subtaskId);
    if (!item) return res.status(404).json({ error: 'Subtask not found.' });
    item.deleteOne();
    await task.save();
    const saved = await accessibleTask(task.id, req.user);
    return res.json({ task: serializeTask(saved.task, req.user) });
  } catch (error) { return next(error); }
});

module.exports = router;
