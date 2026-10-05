const mongoose = require('mongoose');

const roles = ['Admin', 'Project Manager', 'Team Member'];

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  tokenVersion: { type: Number, default: 0, select: false },
  role: { type: String, enum: roles, default: 'Team Member', required: true },
  jobTitle: { type: String, trim: true, maxlength: 100, default: '' },
  bio: { type: String, trim: true, maxlength: 500, default: '' }
}, { timestamps: true, versionKey: false });

module.exports = { User: mongoose.model('User', userSchema), roles };
