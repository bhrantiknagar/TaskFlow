const mongoose = require('mongoose');
const app = require('./app');
const config = require('./config');

async function start() {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
  const server = app.listen(config.port, () => console.log(`TaskFlow server listening on port ${config.port}`));
  const shutdown = async signal => {
    console.log(`${signal} received. Closing TaskFlow server.`);
    server.close(async () => {
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
