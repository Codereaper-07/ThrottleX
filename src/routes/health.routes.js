const express = require('express');
const { success } = require('../utils/response');
const redisClient = require('../redis/client');

const router = express.Router();

router.get('/health', (req, res) => {
  // isReady simply reflects current connection state; it never triggers
  // a reconnect attempt.
  const redisConnected = redisClient.isReady;

  success(res, {
    status: redisConnected ? 'ok' : 'degraded',
    service: 'ThrottleX',
    redis: redisConnected ? 'connected' : 'disconnected',
  });
});

module.exports = router;
