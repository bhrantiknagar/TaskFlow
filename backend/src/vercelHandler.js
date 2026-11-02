const app = require('./app');
const { connectDatabase } = require('./database');

module.exports = async function taskFlowApiHandler(req, res) {
  try {
    await connectDatabase();
    return app(req, res);
  } catch (error) {
    console.error('TaskFlow database connection failed:', error.name, error.code || '');
    return res.status(503).json({ error: 'The service is temporarily unavailable. Please try again shortly.' });
  }
};
