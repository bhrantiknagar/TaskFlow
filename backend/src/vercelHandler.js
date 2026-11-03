const app = require('./app');
const { connectDatabase } = require('./database');

module.exports = async function taskFlowApiHandler(req, res) {
  // CORS preflight requests do not need MongoDB. Let Express answer them
  // immediately so a cold or unavailable database cannot turn into a
  // browser-visible CORS failure before the actual API request is made.
  if (req.method === 'OPTIONS') {
    return app(req, res);
  }

  try {
    await connectDatabase();
    return app(req, res);
  } catch (error) {
    console.error('TaskFlow database connection failed:', error.name, error.code || '');
    return res.status(503).json({ error: 'The service is temporarily unavailable. Please try again shortly.' });
  }
};
