const express = require('express');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const authenticate = require('../middleware/authenticate');
const { canViewProject } = require('../middleware/projectAccess');
const { Project } = require('../models/Project');
const { Task } = require('../models/Task');
const { createAiProvider, AiProviderError } = require('../services/aiProvider');

function validObjectId(value) { return typeof value === 'string' && mongoose.isValidObjectId(value); }
function badBody(body, keys) { return !body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !keys.includes(key)); }

function createAiRouter({ provider = createAiProvider(), limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false, message: { error: 'AI request limit reached. Please wait before trying again.' } }) } = {}) {
  const router = express.Router();
  router.use(authenticate, limiter);
  router.post('/suggestions', async (req, res, next) => {
  try {
    if (badBody(req.body, ['projectId']) || !validObjectId(req.body.projectId)) return res.status(400).json({ error: 'A valid projectId is required.' });
    const project = await Project.findById(req.body.projectId).select('name description owner members');
    if (!project || !canViewProject(project, req.user)) return res.status(404).json({ error: 'Project not found.' });
    if (!project.description?.trim()) return res.status(400).json({ error: 'Add a project description before generating task suggestions.' });
    const tasks = await Task.find({ project: project._id }).select('title').sort({ createdAt: -1 }).limit(100).lean();
    const suggestions = await provider.suggestTasks({ project, existingTitles: tasks.map(task => task.title) });
    return res.json({ suggestions });
  } catch (error) { return next(error); }
  });

  router.post('/breakdown', async (req, res, next) => {
  try {
    if (badBody(req.body, ['taskId']) || !validObjectId(req.body.taskId)) return res.status(400).json({ error: 'A valid taskId is required.' });
    const task = await Task.findById(req.body.taskId).populate('project', 'name description owner members');
    if (!task || !task.project || !canViewProject(task.project, req.user)) return res.status(404).json({ error: 'Task not found.' });
    const available = 50 - task.subtasks.length;
    if (available < 1) return res.status(400).json({ error: 'This task already has the maximum of 50 subtasks.' });
    const subtasks = await provider.breakDownTask({ task, maxSubtasks: Math.min(8, available) });
    return res.json({ subtasks });
  } catch (error) { return next(error); }
  });

  // A project member may use AI and explicitly approve drafts, even when their
  // role does not grant general project management permissions.
  router.post('/suggestions/approve', async (req, res, next) => {
    try {
      const { projectId, suggestions } = req.body || {};
      if (badBody(req.body, ['projectId', 'suggestions']) || !validObjectId(projectId)) return res.status(400).json({ error: 'A valid projectId and approved suggestions are required.' });
      if (!Array.isArray(suggestions) || suggestions.length < 1 || suggestions.length > 8) return res.status(400).json({ error: 'Select between 1 and 8 suggestions to save.' });
      const project = await Project.findById(projectId).select('owner members');
      if (!project || !canViewProject(project, req.user)) return res.status(404).json({ error: 'Project not found.' });
      const tasks = [];
      for (const item of suggestions) {
        if (badBody(item, ['title', 'description', 'priority'])) return res.status(400).json({ error: 'Each approved suggestion must contain a title, description, and priority.' });
        const title = typeof item.title === 'string' ? item.title.trim() : '';
        const description = typeof item.description === 'string' ? item.description.trim() : '';
        if (title.length < 2 || title.length > 160 || description.length > 3000 || !['Low', 'Medium', 'High'].includes(item.priority)) return res.status(400).json({ error: 'An approved suggestion contains invalid task fields.' });
        tasks.push({ title, description, priority: item.priority, status: 'To Do', project: project._id, createdBy: req.user.id });
      }
      const saved = await Task.insertMany(tasks, { ordered: true });
      return res.status(201).json({ saved: saved.length });
    } catch (error) { return next(error); }
  });

  router.post('/breakdown/approve', async (req, res, next) => {
    try {
      const { taskId, subtasks } = req.body || {};
      if (badBody(req.body, ['taskId', 'subtasks']) || !validObjectId(taskId)) return res.status(400).json({ error: 'A valid taskId and approved subtasks are required.' });
      if (!Array.isArray(subtasks) || subtasks.length < 1 || subtasks.length > 50) return res.status(400).json({ error: 'Select at least one valid subtask to save.' });
      const task = await Task.findById(taskId).populate('project', 'owner members');
      if (!task || !task.project || !canViewProject(task.project, req.user)) return res.status(404).json({ error: 'Task not found.' });
      if (task.subtasks.length + subtasks.length > 50) return res.status(400).json({ error: 'This task cannot contain more than 50 subtasks.' });
      const titles = [];
      for (const item of subtasks) {
        if (badBody(item, ['title'])) return res.status(400).json({ error: 'Each approved subtask must contain a title.' });
        const title = typeof item.title === 'string' ? item.title.trim() : '';
        if (title.length < 2 || title.length > 160) return res.status(400).json({ error: 'Subtask titles must be between 2 and 160 characters.' });
        titles.push(title);
      }
      const updated = await Task.findOneAndUpdate(
        { _id: task._id, $expr: { $lte: [{ $size: { $ifNull: ['$subtasks', []] } }, 50 - titles.length] } },
        { $push: { subtasks: { $each: titles.map(title => ({ title, completed: false })) } } },
        { new: true, runValidators: true }
      );
      if (!updated) return res.status(409).json({ error: 'The task changed while saving. Refresh and try again.' });
      return res.status(201).json({ saved: titles.length });
    } catch (error) { return next(error); }
  });

  router.use((error, req, res, next) => {
    if (error instanceof AiProviderError) return res.status(error.status).json({ error: error.message });
    return next(error);
  });
  return router;
}

module.exports = createAiRouter();
module.exports.createAiRouter = createAiRouter;
