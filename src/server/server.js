const app = require('./app');
const config = require('../config/env');
const { connectRedis, disconnectRedis } = require('../redis/connection');
const { closeIsolatedPool } = require('../services/tokenBucketService');

let server;

async function start() {
  // Redis must be reachable before we accept traffic, since rate limiting
  // (built on top of this foundation) will depend on it.
  try {
    await connectRedis();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  server = app.listen(config.port, () => {
    console.log('----------------------------------------');
    console.log('ThrottleX running');
    console.log(`Environment: ${config.env}`);
    console.log(`Port: ${config.port}`);
    console.log('----------------------------------------');
  });
}

start();

// Closing the server lets in-flight requests finish instead of dropping
// them, which matters when this process runs behind an orchestrator
// that sends SIGTERM on every deploy/restart.
function shutdown(signal) {
  console.log(`${signal} received: shutting down gracefully`);

  if (!server) {
    process.exit(0);
    return;
  }

  server.close(async () => {
    console.log('HTTP server closed');
    await disconnectRedis();
    console.log('Redis disconnected');
    await closeIsolatedPool();
    console.log('Redis isolated pool closed');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
