const { createClient } = require('redis');
const config = require('../config/env');

// Connecting is deferred to server startup so simply requiring this module
// (e.g. from the health route) never triggers a network call.
const redisClient = createClient({
  socket: {
    host: config.redisHost,
    port: config.redisPort,
    // The default strategy retries forever, which would hang startup
    // indefinitely instead of failing fast when Redis is unreachable.
    reconnectStrategy: false,
  },
});
module.exports = redisClient;
