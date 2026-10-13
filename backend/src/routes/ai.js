const express = require('express');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const authenticate = require('../middleware/authenticate');
const { canManageProject, canViewProject } = require('../middleware/projectAccess');
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
    if (!canManageProject(project, req.user)) return res.status(403).json({ error: 'You do not have permission to create tasks in this project.' });
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
    if (!canManageProject(task.project, req.user)) return res.status(403).json({ error: 'You do not have permission to add subtasks to this task.' });
    const available = 50 - task.subtasks.length;
    if (available < 1) return res.status(400).json({ error: 'This task already has the maximum of 50 subtasks.' });
    const subtasks = await provider.breakDownTask({ task, maxSubtasks: Math.min(8, available) });
    return res.json({ subtasks });
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
