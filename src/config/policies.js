const rateLimiterConfig = require('./rateLimiterConfig');

const demoPolicy = {
  capacity: rateLimiterConfig.capacity,
  refillRate: rateLimiterConfig.refillRate,
  ttlSeconds: rateLimiterConfig.bucketTtlSeconds,
  identifier: (req) => req.ip,
};

module.exports = { demoPolicy };
