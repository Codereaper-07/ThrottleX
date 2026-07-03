const { WatchError } = require('redis');
const redisClient = require('../redis/client');
const currentTimestamp = require('../utils/time');

const BUCKET_KEY_PREFIX = 'throttlex:bucket:';
const MAX_RETRIES = 3;

async function consume(identifier, policy) {
  const key = `${BUCKET_KEY_PREFIX}${identifier}`;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      return await attemptConsume(key, policy);
    } catch (err) {
      // Another client changed the bucket between our WATCH and EXEC;
      // retrying with a fresh read is the standard optimistic-locking fix.
      if (!(err instanceof WatchError)) {
        throw err;
      }
    }
  }

  throw new Error(`Could not update bucket "${key}" after ${MAX_RETRIES} retries due to concurrent writes`);
}

async function attemptConsume(key, policy) {
  const { capacity, refillRate, ttlSeconds } = policy;

  await redisClient.watch(key);

  const raw = await redisClient.hGetAll(key);
  const now = currentTimestamp();
  const bucket = raw.tokens
    ? { tokens: Number(raw.tokens), lastRefill: Number(raw.lastRefill) }
    : { tokens: capacity, lastRefill: now };

  const elapsedSeconds = (now - bucket.lastRefill) / 1000;
  const refilledTokens = Math.min(capacity, bucket.tokens + elapsedSeconds * refillRate);

  const allowed = refilledTokens >= 1;
  const tokensAfterConsume = allowed ? refilledTokens - 1 : refilledTokens;
  // Ceil so a client that waits exactly retryAfter seconds always has a token.
  const retryAfter = allowed ? 0 : Math.ceil((1 - refilledTokens) / refillRate);

  // WATCH makes this HSET+EXPIRE fail with WatchError if the key changed
  // since the HGETALL above, instead of silently overwriting a concurrent update.
  await redisClient
    .multi()
    .hSet(key, { tokens: tokensAfterConsume, lastRefill: now })
    .expire(key, ttlSeconds)
    .exec();

  return {
    allowed,
    remainingTokens: Math.floor(tokensAfterConsume),
    retryAfter,
  };
}

module.exports = { consume };
