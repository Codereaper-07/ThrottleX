const redisClient = require('./client');

// node-redis emits 'error' for socket-level failures; without a listener
// those errors are unhandled exceptions that crash the process.
redisClient.on('error', (err) => {
  console.error('Redis client error:', err.message);
});

async function connectRedis() {
  // client.connect() throws if called while already open/connecting,
  // so guard against that instead of letting startup crash on a retry.
  if (redisClient.isOpen) {
    return;
  }

  try {
    await redisClient.connect();
    console.log('Redis connected');
  } catch (err) {
    throw new Error(`Failed to connect to Redis: ${err.message}`);
  }
}

async function disconnectRedis() {
  if (redisClient.isOpen) {
    await redisClient.disconnect();
  }
}

module.exports = { connectRedis, disconnectRedis };
