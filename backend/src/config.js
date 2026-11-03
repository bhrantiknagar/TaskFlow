const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });
  
function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
 
const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  mongoUri: required('MONGODB_URI'),
  mongoDatabase: process.env.MONGODB_DB_NAME || 'taskFlow',
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  cookieName: process.env.COOKIE_NAME || 'taskflow_token',
  cookieSecure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
  cookieSameSite: (process.env.COOKIE_SAME_SITE || 'strict').toLowerCase(),
  frontendOrigins: new Set((process.env.FRONTEND_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000,http://127.0.0.1:3000').split(',').map(origin => origin.trim()).filter(Boolean))
};

if (config.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long.');
}

if (!['strict', 'lax', 'none'].includes(config.cookieSameSite)) {
  throw new Error('COOKIE_SAME_SITE must be strict, lax, or none.');
}

if (config.cookieSameSite === 'none' && !config.cookieSecure) {
  throw new Error('COOKIE_SECURE must be true when COOKIE_SAME_SITE is none.');
}

module.exports = config;
