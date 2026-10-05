const mongoose = require('mongoose');

const projectStatuses = ['Planning', 'In progress', 'On hold', 'Completed'];

const projectSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  startDate: { type: Date, default: null },
  deadline: { type: Date, default: null },
  status: { type: String, enum: projectStatuses, default: 'Planning', required: true }
}, { timestamps: true, versionKey: false });

projectSchema.index({ owner: 1, updatedAt: -1 });
projectSchema.index({ members: 1, updatedAt: -1 });

module.exports = { Project: mongoose.model('Project', projectSchema), projectStatuses };
