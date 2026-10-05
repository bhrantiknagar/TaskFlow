const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { rateLimit } = require('express-rate-limit');
const { User } = require('../models/User');
const config = require('../config');
const authenticate = require('../middleware/authenticate');

const router = express.Router();
const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many sign-in attempts. Try again in 15 minutes.' } });
const registerLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many registration attempts. Try again later.' } });
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const publicUser = user => ({ id: user.id, name: user.name, email: user.email, role: user.role, jobTitle: user.jobTitle, bio: user.bio });

function setSessionCookie(res, user) {
  const token = jwt.sign({ sub: user.id, role: user.role, tokenVersion: user.tokenVersion || 0 }, config.jwtSecret, { algorithm: 'HS256', expiresIn: config.jwtExpiresIn });
  const decoded = jwt.decode(token);
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict',
    path: '/',
    maxAge: Math.max(0, decoded.exp * 1000 - Date.now())
  });
}

function clearSessionCookie(res) {
  res.clearCookie(config.cookieName, { httpOnly: true, secure: config.cookieSecure, sameSite: 'strict', path: '/' });
}

router.post('/register', registerLimit, async (req, res, next) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const errors = [];
    if (name.length < 2 || name.length > 80) errors.push('Name must be between 2 and 80 characters.');
    if (email.length > 254 || !emailPattern.test(email)) errors.push('Enter a valid email address.');
    if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) errors.push('Password must be at least 8 characters and no more than 72 bytes.');
    if (errors.length) return res.status(400).json({ error: errors[0], details: errors });

    const existing = await User.exists({ email });
    if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash });
    setSessionCookie(res, user);
    return res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'An account with this email already exists.' });
    return next(error);
  }
});

router.post('/login', loginLimit, async (req, res, next) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!emailPattern.test(email) || !password || Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json({ error: 'Enter a valid email address and password.' });
    }
    const user = await User.findOne({ email }).select('+passwordHash +tokenVersion');
    const validPassword = user && await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) return res.status(401).json({ error: 'Email or password is incorrect.' });
    setSessionCookie(res, user);
    return res.json({ user: publicUser(user) });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', async (req, res, next) => {
  const token = req.cookies?.[config.cookieName];
  if (token) {
    try {
      const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
      await User.updateOne({ _id: payload.sub, tokenVersion: payload.tokenVersion }, { $inc: { tokenVersion: 1 } });
    } catch (error) {
      if (error.name !== 'JsonWebTokenError' && error.name !== 'TokenExpiredError') return next(error);
    }
  }
  clearSessionCookie(res);
  return res.status(200).json({ message: 'You have been signed out.' });
});

router.get('/me', authenticate, (req, res) => res.json({ user: publicUser(req.user) }));

router.patch('/me', authenticate, async (req, res, next) => {
  try {
    const allowed = ['name', 'jobTitle', 'bio'];
    const updates = {};
    const errors = [];
    for (const key of allowed) {
      if (!(key in (req.body || {}))) continue;
      if (typeof req.body[key] !== 'string') { errors.push(`${key} must be text.`); continue; }
      const value = req.body[key].trim();
      const max = key === 'name' ? 80 : key === 'jobTitle' ? 100 : 500;
      if ((key === 'name' && value.length < 2) || value.length > max) {
        errors.push(key === 'name' ? 'Name must be between 2 and 80 characters.' : `${key} must be no more than ${max} characters.`);
      } else updates[key] = value;
    }
    if (errors.length) return res.status(400).json({ error: errors[0], details: errors });
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'Provide at least one profile field to update.' });
    const user = await User.findByIdAndUpdate(req.user.id, { $set: updates }, { new: true, runValidators: true }).select('name email role jobTitle bio');
    return res.json({ user: publicUser(user) });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
