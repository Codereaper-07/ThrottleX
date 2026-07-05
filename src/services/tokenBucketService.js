const { WatchError } = require('redis');
const redisClient = require('../redis/client');
const currentTimestamp = require('../utils/time');

const BUCKET_KEY_PREFIX = 'throttlex:bucket:';
const MAX_RETRIES = 3;

// WATCH state is tracked by Redis per TCP connection, not per logical
// transaction. Running WATCH/HGETALL/MULTI/EXEC on the app's single shared
// client would let one identifier's transaction be silently invalidated (or
// have its abort silently swallowed) by another identifier's unrelated
// transaction sharing that same connection — node-redis's documented fix is
// to give each WATCH...EXEC sequence its own exclusive connection, which is
// what this pool (built from the existing client's own connection options)
// provides. `pool.connect()` is idempotent — it no-ops once already open —
// so it's safe to await on every call without extra bookkeeping.
const isolatedPool = redisClient.createPool();
isolatedPool.on('error', (err) => {
  console.error('Redis isolated pool error:', err.message);
});

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

  await isolatedPool.connect();

  return isolatedPool.execute(async (isolatedClient) => {
    await isolatedClient.watch(key);

    const raw = await isolatedClient.hGetAll(key);
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
    await isolatedClient
      .multi()
      .hSet(key, { tokens: tokensAfterConsume, lastRefill: now })
      .expire(key, ttlSeconds)
      .exec();

    return {
      allowed,
      remainingTokens: Math.floor(tokensAfterConsume),
      retryAfter,
    };
  });
}

// redisClient.disconnect() (used during graceful shutdown) only tears down
// the singleton client's own socket — createPool() returns an independent
// RedisClientPool with no back-reference to it, so the pool's connections
// must be closed separately. close() drains in-flight commands first and
// safely no-ops if the pool was never connected.
async function closeIsolatedPool() {
  await isolatedPool.close();
}

module.exports = { consume, closeIsolatedPool };
