const mongoose = require('mongoose');

const priorities = ['Low', 'Medium', 'High'];
const taskStatuses = ['To Do', 'In Progress', 'Completed'];

const subtaskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 2, maxlength: 160 },
  completed: { type: Boolean, default: false }
}, { timestamps: true });

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 2, maxlength: 160 },
  description: { type: String, trim: true, maxlength: 3000, default: '' },
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  priority: { type: String, enum: priorities, default: 'Medium', required: true },
  status: { type: String, enum: taskStatuses, default: 'To Do', required: true },
  dueDate: { type: Date, default: null },
  subtasks: { type: [subtaskSchema], default: [] }
}, { timestamps: true, versionKey: false });

taskSchema.index({ project: 1, status: 1, updatedAt: -1 });
taskSchema.index({ project: 1, priority: 1, updatedAt: -1 });
taskSchema.index({ assignee: 1, status: 1, updatedAt: -1 });
taskSchema.index({ title: 'text', description: 'text' });

module.exports = { Task: mongoose.model('Task', taskSchema), priorities, taskStatuses };
