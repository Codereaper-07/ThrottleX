const { consume } = require('../services/tokenBucketService');
const { error } = require('../utils/response');

function rateLimiter(policy) {
  return async function rateLimiterMiddleware(req, res, next) {
    try {
      const identifier = policy.identifier(req);
      const { allowed, remainingTokens, retryAfter } = await consume(identifier, policy);

      res.set('X-RateLimit-Limit', policy.capacity);
      res.set('X-RateLimit-Remaining', remainingTokens);

      if (!allowed) {
        res.set('Retry-After', retryAfter);
        error(res, 'Rate limit exceeded', 429);
        return;
      }

      next();
    } catch (err) {
      // Unexpected failures (e.g. Redis unreachable) are not the caller's
      // fault to interpret, so hand them to the centralized error handler.
      next(err);
    }
  };
}

module.exports = rateLimiter;
