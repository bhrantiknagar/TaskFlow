const jwt = require('jsonwebtoken');
const config = require('../config');
const { User } = require('../models/User');

async function authenticate(req, res, next) {
  const token = req.cookies?.[config.cookieName];
  if (!token) return res.status(401).json({ error: 'Authentication required.' });

  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    const user = await User.findById(payload.sub).select('name email role jobTitle bio +tokenVersion');
    if (!user) return res.status(401).json({ error: 'Session is no longer valid.' });
    if (payload.tokenVersion !== user.tokenVersion) return res.status(401).json({ error: 'Session is no longer valid.' });
    req.user = user;
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session is invalid or expired.' });
    }
    return next(error);
  }
}

module.exports = authenticate;
