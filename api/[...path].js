const app = require('../backend/src/app');
const { connectDatabase } = require('../backend/src/database');

module.exports = async function handler(req, res) {
  try {
    await connectDatabase();
    return app(req, res);
  } catch (error) {
    console.error('TaskFlow database connection failed:', error.message);
    return res.status(503).json({ error: 'The service is temporarily unavailable. Please try again shortly.' });
  }
};
