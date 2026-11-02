const app = require('./app');
const config = require('./config');
const { connectDatabase } = require('./database');

async function start() {
  await connectDatabase();
  const server = app.listen(config.port, () => console.log(`TaskFlow server listening on port ${config.port}`));
  const shutdown = async signal => {
    console.log(`${signal} received. Closing TaskFlow server.`);
    server.close(async () => {
      const mongoose = require('mongoose');
      await mongoose.disconnect();
      process.exit(0);
    });
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}
   
start().catch(error => {
  console.error('Unable to start TaskFlow:', error.message);
  process.exitCode = 1;
});
