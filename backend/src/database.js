const mongoose = require('mongoose');
const config = require('./config');

let connectionPromise;
 
function connectDatabase() {
  if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose.connection);

  if (!connectionPromise) {
    connectionPromise = mongoose.connect(config.mongoUri, {
      dbName: config.mongoDatabase,
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 5
    }).then(() => mongoose.connection).catch(error => {
      connectionPromise = undefined;
      throw error;
    });
  }

  return connectionPromise; 
}

module.exports = { connectDatabase };
