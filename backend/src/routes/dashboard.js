const express = require('express');
const mongoose = require('mongoose');
const authenticate = require('../middleware/authenticate');
const { Project } = require('../models/Project');
const { Task, taskStatuses } = require('../models/Task');

const router = express.Router();
const ranges = ['week', 'month', 'all', 'overdue'];

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { project: projectId, range = 'week' } = req.query;
    if (!ranges.includes(range)) return res.status(400).json({ error: `Range must be one of: ${ranges.join(', ')}.` });
    if (projectId !== undefined && !mongoose.isValidObjectId(projectId)) return res.status(400).json({ error: 'Invalid project id.' });

    const projectFilter = req.user.role === 'Admin'
      ? {}
      : { $or: [{ owner: req.user.id }, { members: req.user.id }] };
    if (projectId) projectFilter._id = projectId;
    const projects = await Project.find(projectFilter)
      .select('_id name status deadline updatedAt')
      .sort({ updatedAt: -1 }).lean();
    if (projectId && !projects.length) return res.status(404).json({ error: 'Project not found.' });

    const projectIds = projects.map(project => project._id);
    const records = projectIds.length
      ? await Task.find({ project: { $in: projectIds } })
        .select('_id title project assignee priority status subtasks dueDate updatedAt')
        .populate('assignee', 'name email').sort({ updatedAt: -1 }).lean()
      : [];
    const projectMap = new Map(projects.map(project => [String(project._id), project]));
    const counts = new Map(projects.map(project => [String(project._id), { total: 0, completed: 0, progressTotal: 0 }]));
    const serializedTasks = records.map(task => {
      const project = projectMap.get(String(task.project));
      const count = counts.get(String(task.project));
      const progress = task.status === 'Completed' ? 100 : task.subtasks.length ? Math.round(task.subtasks.filter(subtask => subtask.completed).length / task.subtasks.length * 100) : 0;
      count.total += 1;
      if (task.status === 'Completed') count.completed += 1;
      count.progressTotal += progress;
      return {
        id: String(task._id), title: task.title,
        project: { id: String(project._id), name: project.name },
        assignee: task.assignee ? { id: String(task.assignee._id), name: task.assignee.name, email: task.assignee.email } : null,
        priority: task.priority, status: task.status, progress, dueDate: task.dueDate, updatedAt: task.updatedAt
      };
    });
    const projectResults = projects.map(project => {
      const count = counts.get(String(project._id));
      return {
        id: String(project._id), name: project.name, status: project.status, deadline: project.deadline,
        taskCount: count.total, completedTaskCount: count.completed,
        progress: count.total ? Math.round(count.progressTotal / count.total) : 0
      };
    });
    const taskGroups = Object.fromEntries(taskStatuses.map(status => {
      const matching = serializedTasks.filter(task => task.status === status);
      return [status, { count: matching.length, tasks: matching.slice(0, 6) }];
    }));
    const now = new Date();
    const startToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const end = new Date(startToday);
    if (range === 'week') {
      end.setUTCDate(end.getUTCDate() + (7 - end.getUTCDay()));
      end.setUTCHours(23, 59, 59, 999);
    } else if (range === 'month') {
      end.setUTCMonth(end.getUTCMonth() + 1, 0);
      end.setUTCHours(23, 59, 59, 999);
    } else if (range === 'all') end.setUTCFullYear(end.getUTCFullYear() + 10);

    const deadlines = serializedTasks.filter(task => {
      if (!task.dueDate) return false;
      const due = new Date(task.dueDate);
      if (range === 'overdue') return due < startToday && task.status !== 'Completed';
      return range === 'all' ? true : due <= end && (due >= startToday || task.status !== 'Completed');
    }).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)).slice(0, 8);

    return res.json({
      filters: { project: projectId || '', range },
      projects: projectResults,
      stats: {
        totalProjects: projects.length,
        totalTasks: serializedTasks.length,
        completedTasks: taskGroups.Completed.count,
        pendingTasks: serializedTasks.length - taskGroups.Completed.count
      },
      assignedTaskCount: serializedTasks.filter(task => task.assignee?.id === req.user.id).length,
      taskGroups,
      upcomingTasks: deadlines,
      recentActivity: []
    });
  } catch (error) { return next(error); }
});

module.exports = router;
