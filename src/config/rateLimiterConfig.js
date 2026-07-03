const dotenv = require('dotenv');

dotenv.config();

// Fails fast at startup instead of letting an invalid threshold silently
// produce nonsensical rate-limiting behavior (e.g. a bucket that never
// refills, or expires before it can ever be used).
function readPositiveNumber(envVarName, defaultValue) {
  const raw = process.env[envVarName];
  const value = raw === undefined ? defaultValue : Number(raw);

  if (Number.isNaN(value) || value <= 0) {
    throw new Error(`${envVarName} must be a positive number`);
  }

  return value;
}

const rateLimiterConfig = Object.freeze({
  capacity: readPositiveNumber('BUCKET_CAPACITY', 5),
  refillRate: readPositiveNumber('REFILL_RATE', 1),
  bucketTtlSeconds: readPositiveNumber('BUCKET_TTL', 10),
});

module.exports = rateLimiterConfig;
