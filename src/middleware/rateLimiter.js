const { consume } = require('../services/tokenBucketService');
const { error } = require('../utils/response');
const { rateLimitRequestsTotal } = require('../metrics/prometheus');

function rateLimiter(policy) {
  return async function rateLimiterMiddleware(req, res, next) {
    try {
      const identifier = policy.identifier(req);
      const { allowed, remainingTokens, retryAfter } = await consume(identifier, policy);

      res.set('X-RateLimit-Limit', policy.capacity);
      res.set('X-RateLimit-Remaining', remainingTokens);

      if (!allowed) {
        rateLimitRequestsTotal.inc({ result: 'blocked' });
        res.set('Retry-After', retryAfter);
        error(res, 'Rate limit exceeded', 429);
        return;
      }

      rateLimitRequestsTotal.inc({ result: 'allowed' });
      next();
    } catch (err) {
      // Unexpected failures (e.g. Redis unreachable) are not the caller's
      // fault to interpret, so hand them to the centralized error handler.
      next(err);
    }
  };
}

module.exports = rateLimiter;
