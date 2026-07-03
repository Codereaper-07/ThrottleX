# ThrottleX

## Overview

ThrottleX is a distributed API rate limiting service built with Node.js, Express, and Redis. It was built as a hands-on production-engineering project to practice the concerns that matter in real backend infrastructure — distributed state, atomicity under concurrency, graceful failure handling, containerized deployment, and observability — rather than another CRUD app.

**The problem it solves:** a single API process can rate-limit clients in memory, but that breaks the moment you run more than one instance (each instance has its own counters, so a client can get N requests per instance instead of N total). ThrottleX solves this by storing rate-limit state in Redis, shared by every instance of the app, so the limit is enforced consistently no matter how many app replicas are running behind a load balancer.

## Current Status

The project is **feature-complete for its MVP**. Completed features:

- Token Bucket rate limiter (see [Design Decisions](#design-decisions) for why Token Bucket was chosen over alternatives)
- Redis-based distributed storage for rate-limit state (Redis Hashes, atomic via `WATCH`/`MULTI`/`EXEC`)
- Express.js REST API
- Docker support (production `Dockerfile`)
- Docker Compose orchestration (app + Redis + Nginx + Prometheus + Grafana, one command)
- Nginx reverse proxy
- Prometheus metrics (custom + default Node.js/process metrics)
- Grafana dashboard (auto-provisioned datasource + dashboard)
- Health check endpoint (`/health`, reports Redis connectivity)
- Metrics endpoint (`/metrics`, Prometheus exposition format)
- Centralized error handling and 404 handling
- Graceful shutdown (`SIGINT`/`SIGTERM` → close HTTP server → disconnect Redis)

**Not yet implemented** (see [Known Issues](#known-issues) and [Future Improvements](#future-improvements)): rate-limit thresholds are currently hardcoded per policy in code, not exposed via environment variables or an API; no automated test suite.

## Tech Stack

| Category | Technology |
|---|---|
| Runtime | Node.js 22 (Alpine in Docker) |
| Web framework | Express 5 |
| Data store | Redis 7 (`redis` npm client v6, official Node client) |
| Reverse proxy | Nginx (Alpine) |
| Metrics | `prom-client` (app-side), Prometheus (`prom/prometheus`) |
| Dashboards | Grafana OSS (`grafana/grafana-oss`) |
| Containerization | Docker, Docker Compose |
| Config | `dotenv` |
| Dev tooling | `nodemon` |

## Architecture

Requests always enter through Nginx, which forwards everything to the Express app. The app reads/writes rate-limit state in Redis for every request to `/limited`. Prometheus independently scrapes the app's `/metrics` endpoint on a timer, and Grafana queries Prometheus to render dashboards. None of this is visible to the client — they only ever talk to Nginx.

```
                                   ┌─────────────┐
                                   │   Client    │
                                   └──────┬──────┘
                                          │ HTTP :8080
                                          ▼
                                   ┌─────────────┐
                                   │    Nginx    │  (reverse proxy, adds
                                   │  (port 80)  │   X-Forwarded-* headers)
                                   └──────┬──────┘
                                          │ proxy_pass http://app:3000
                                          ▼
                                   ┌─────────────┐
                          ┌────────┤  Express    ├────────┐
                          │        │  (ThrottleX) │        │
                          │        └──────┬──────┘        │
                          │               │                │
                 WATCH/HGETALL/    GET /metrics      GET /health
                 MULTI/HSET/EXEC   (prom-client)     (checks redis.isReady)
                          │               │                │
                          ▼               │                │
                   ┌─────────────┐        │                │
                   │    Redis    │        │                │
                   │ (bucket per │        │                │
                   │ identifier) │        │                │
                   └─────────────┘        │                │
                                          ▼
                                  ┌───────────────┐
                                  │  Prometheus   │  scrapes app:3000/metrics
                                  │  (port 9090)  │  every 5s
                                  └───────┬───────┘
                                          │ PromQL queries
                                          ▼
                                  ┌───────────────┐
                                  │    Grafana    │  auto-provisioned
                                  │  (port 3001)  │  datasource + dashboard
                                  └───────────────┘
```

## Folder Structure

```
ThrottleX/
├── src/
│   ├── config/       # env.js (loads/validates env vars), policies.js (rate-limit policies)
│   ├── controllers/  # reserved for future use — currently empty (logic lives in routes)
│   ├── errors/        # AppError.js — custom error class for operational errors
│   ├── metrics/       # prometheus.js — Prometheus metric definitions and registry
│   ├── middleware/    # rateLimiter, metrics, errorHandler, notFound
│   ├── redis/         # client.js (singleton client), connection.js (connect/disconnect lifecycle)
│   ├── routes/        # health.routes.js, limited.routes.js, metrics.routes.js
│   ├── server/        # app.js (Express wiring), server.js (process entrypoint, startup/shutdown)
│   ├── services/      # tokenBucketService.js — the core rate-limiting algorithm
│   └── utils/         # response.js (success/error helpers), time.js (currentTimestamp)
├── tests/             # reserved for an automated test suite — currently empty
├── docker/            # nginx.conf — the actual Nginx reverse-proxy config used by docker-compose
├── nginx/             # legacy placeholder from initial scaffolding — unused; see docker/nginx.conf instead
├── prometheus/        # prometheus.yml — scrape configuration
├── grafana/           # provisioning/datasources + provisioning/dashboards — auto-provisioned on boot
├── docs/              # reserved for future documentation — currently empty
├── .github/           # reserved for future CI/CD workflows — currently empty
├── Dockerfile         # production image build
├── docker-compose.yml # full local stack: app, redis, nginx, prometheus, grafana
└── README.md          # quick-start instructions
```

> Note: the `nginx/` directory (top-level) is an unused placeholder left over from initial project scaffolding. The Nginx config actually mounted by `docker-compose.yml` lives at `docker/nginx.conf`.

## API Endpoints

| Method | Path | Description | Success Response | Failure Responses |
|---|---|---|---|---|
| `GET` | `/health` | Reports service and Redis connectivity status. Never attempts to reconnect. | `200` `{ "status": "ok", "service": "ThrottleX", "redis": "connected" }` | `200` `{ "status": "degraded", "service": "ThrottleX", "redis": "disconnected" }` when Redis is unreachable |
| `GET` | `/limited` | Demo endpoint protected by the Token Bucket rate limiter (`demoPolicy`: capacity 5, refill 1 token/sec, keyed by client IP). | `200` `{ "message": "Request accepted" }` with headers `X-RateLimit-Limit`, `X-RateLimit-Remaining` | `429` `{ "error": "Rate limit exceeded" }` with headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After` |
| `GET` | `/metrics` | Prometheus scrape target. | `200`, `Content-Type: text/plain; version=0.0.4; charset=utf-8`, body = Prometheus text exposition format | `500` `{ "error": "Internal Server Error" }` on scrape failure |
| any | `*` (unmatched route) | Fallback for unknown routes. | — | `404` `{ "error": "Route not found" }` |
| any | `*` (unhandled error) | Centralized error handler. | — | `500` `{ "error": "Internal Server Error" }`, or `<statusCode>` `{ "error": "<message>" }` for operational `AppError`s |

## Metrics

Exposed at `GET /metrics` via `prom-client`, default registry.

**Custom application metrics:**

| Name | Type | Labels | Represents |
|---|---|---|---|
| `http_requests_total` | Counter | `method`, `route`, `status` | Total HTTP requests handled, broken down by verb, matched route, and response status code. Incremented once per request on response `finish`. |
| `rate_limit_requests_total` | Counter | `result` (`allowed` \| `blocked`) | Total rate-limiter decisions. Lets you compute the ratio of allowed vs. blocked traffic over time. |
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status` | Request latency distribution, in seconds, from the metrics middleware's timer to response `finish`. Buckets: `0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10`. |

**Default metrics** (from `client.collectDefaultMetrics()`): standard Node.js/process metrics such as `process_cpu_seconds_total`, `process_resident_memory_bytes`, `nodejs_heap_size_used_bytes`, `nodejs_eventloop_lag_seconds`, etc. — useful for the "Node Memory Usage" and "Node CPU Usage" Grafana panels.

## Design Decisions

**Why Redis?** Rate-limit counters must be shared across every instance of the app for the limit to mean anything in a horizontally-scaled deployment. Redis gives us that shared state with sub-millisecond latency, native data structures (Hashes) that map cleanly onto a bucket's fields, per-key TTL for automatic cleanup of idle buckets, and — critically — `WATCH`/`MULTI`/`EXEC` for optimistic locking, so concurrent requests hitting the same bucket can't corrupt each other's updates.

**Why Token Bucket?** Compared to a fixed window counter (which allows a burst of `2×capacity` requests at a window boundary) or a naive sliding log (which requires storing a timestamp per request), Token Bucket needs only two numbers per identifier (`tokens`, `lastRefill`), refills smoothly over time instead of resetting abruptly, and naturally supports short bursts up to `capacity` while still enforcing a steady average rate (`refillRate`). It's also simple to reason about and cheap to compute on every request.

**Why Docker Compose?** The full system has five moving parts (app, Redis, Nginx, Prometheus, Grafana) that need to discover each other by name, share a network, and start in a sane order. Docker Compose turns "install and configure five things correctly" into `docker compose up --build`, and gives every contributor an identical, reproducible environment.

**Why Nginx?** It gives the system a single public entry point, decoupling clients from the internal service topology (the app and Redis are not directly reachable from outside the Docker network). It also forwards `X-Forwarded-For`/`X-Forwarded-Proto`/`Host` so the app can see the real client IP (used as the rate-limit identifier) even though Nginx is technically the one making the request — this is why `app.set('trust proxy', true)` is set in `app.js`. It's also the natural place to later add TLS termination, caching, or load balancing across multiple app replicas.

**Why Prometheus and Grafana?** They're the de facto standard pull-based metrics stack for containerized services — the app doesn't need to know anything about who's monitoring it, it just exposes `/metrics` and Prometheus scrapes it on its own schedule. Grafana turns those raw metrics into dashboards that make it possible to see rate-limiting behavior, latency, and resource usage at a glance instead of grepping logs.

## How to Run

### Local setup (without Docker)

Requires a running Redis instance reachable from your machine.

```bash
npm install
cp .env.example .env   # adjust PORT / REDIS_HOST / REDIS_PORT if needed
npm run dev            # nodemon, auto-restarts on file changes
# or: npm start         # plain node, for a production-like run
```

### Docker Compose setup (recommended)

Starts the app, Redis, Nginx, Prometheus, and Grafana together — no local Redis needed.

```bash
docker compose up --build
```

### URLs

| Service | URL |
|---|---|
| API (via Nginx) | http://localhost:8080 |
| Health check | http://localhost:8080/health |
| Metrics (Prometheus format) | http://localhost:8080/metrics |
| Rate-limited demo endpoint | http://localhost:8080/limited |
| Prometheus UI | http://localhost:9090 |
| Grafana UI | http://localhost:3001 (login: `admin` / `admin`) |

## Testing

There is no automated test suite yet (see [Known Issues](#known-issues)); verification today is manual:

**Generate requests:**
```bash
curl -i http://localhost:8080/limited
```

**Trigger rate limiting:** `demoPolicy` allows 5 requests before refilling at 1/sec, so 6 rapid requests will trip it:
```bash
for i in $(seq 1 6); do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/limited; done
# Expect: 200 200 200 200 200 429
```

**Verify Redis state directly:**
```bash
docker compose exec redis redis-cli
> KEYS throttlex:bucket:*
> HGETALL throttlex:bucket:<identifier>   # e.g. the client IP used above
```

**Verify Prometheus is scraping:** open http://localhost:9090/targets and confirm the `throttlex` job / `app:3000` target shows as `UP`. Then run a PromQL query such as `rate_limit_requests_total` in the Prometheus UI to see live counter values.

**Verify Grafana provisioning:** open http://localhost:3001, log in with `admin`/`admin`, and confirm the **Prometheus** datasource already exists under Connections → Data sources, and the **ThrottleX Overview** dashboard already exists under Dashboards — both without any manual setup. Send a few requests to `/limited` and `/health` and watch the panels update within ~5 seconds (matching the scrape/refresh interval).

## Known Issues

- **No automated test suite.** `tests/` exists but is empty; all verification so far has been manual/exploratory (including mock-Redis-based testing during development, since a live Redis wasn't always available in the dev sandbox).
- **Rate-limit thresholds are hardcoded**, not configurable via environment variables. `demoPolicy` (`capacity: 5`, `refillRate: 1`) lives in `src/config/policies.js` as a plain object; changing it requires a code change and redeploy, not a config change.
- **Shared Redis connection for `WATCH`/`MULTI`/`EXEC`.** The app uses a single Redis client connection for all rate-limit transactions. Redis's `WATCH` semantics are per-connection, so under very high concurrent traffic across *different* identifiers on that one connection, there's a theoretical edge case where overlapping transactions could interfere. A per-request isolated connection (or a Lua script for true server-side atomicity) would remove this caveat entirely; it wasn't implemented in order to avoid modifying the existing Redis connection architecture mid-project.
- **No automatic Redis reconnection after startup.** `reconnectStrategy: false` is set intentionally so the app fails fast at *startup* if Redis is unreachable (instead of hanging forever on the default infinite-retry strategy) — but this also means if Redis drops after the app is already running, the client won't attempt to reconnect on its own; the process would need an external restart (e.g. via an orchestrator) to recover.
- **No authentication on any endpoint**, including `/metrics`. In a real production deployment, `/metrics` in particular should be restricted to internal network access only.
- **Single hardcoded policy.** Only one demo policy exists; there's no mechanism yet to apply different rate limits to different routes or user tiers via configuration.

## Future Improvements

Roadmap, roughly in priority order:

1. **Configurable rate limits** — move `capacity`/`refillRate` into environment variables or a config file instead of hardcoding them in `policies.js`.
2. **Automated testing** — unit tests for `tokenBucketService.js` (algorithm correctness, retry/atomicity behavior) and integration tests for the HTTP layer (e.g. with Jest + Supertest).
3. **GitHub Actions CI/CD** — lint, test, and build the Docker image automatically on every push/PR.
4. **Structured logging** (Pino or Winston) — replace `console.log`/`console.error` with structured, leveled logs suitable for aggregation.
5. **JWT authentication example** — demonstrate rate limiting per authenticated user (via a decoded JWT claim) instead of only by IP.
6. **Distributed multi-instance deployment** — run multiple app replicas behind Nginx to prove the Redis-backed limiter behaves correctly under real horizontal scaling.
7. **Redis Cluster support** — evaluate and adapt the key scheme/transactions for a clustered Redis deployment instead of a single instance.
8. **Load testing** — benchmark throughput and latency under sustained/burst load (e.g. with k6 or autocannon) and validate the rate limiter's behavior under real concurrency.
9. **Kubernetes deployment** — Helm chart or raw manifests as an alternative to Docker Compose for production-grade orchestration.
10. **Alerting via Prometheus/Grafana** — alert rules for high block rates, Redis unavailability, or elevated latency.
11. **Better dashboard visualizations** — percentile latency panels (p50/p95/p99), per-identifier breakdowns, and annotations for deploys.
12. **API versioning** — introduce `/v1` prefixing ahead of any breaking changes.
13. **OpenAPI/Swagger documentation** — machine-readable API spec and interactive docs.

## Resume Description

> **ThrottleX — Distributed API Rate Limiting Service** (Node.js, Express, Redis, Docker, Prometheus, Grafana). Designed and built a production-style rate limiting service implementing a Redis-backed Token Bucket algorithm with atomic optimistic-locking transactions (`WATCH`/`MULTI`/`EXEC`) to safely handle concurrent requests across distributed instances. Containerized the full stack (app, Redis, Nginx reverse proxy, Prometheus, Grafana) with Docker Compose for one-command deployment, instrumented the service with custom Prometheus metrics, and built an auto-provisioned Grafana dashboard for real-time observability of traffic and rate-limiting behavior.

## Interview Talking Points

1. Why a fixed-window rate limiter is vulnerable to boundary bursts, and how Token Bucket avoids that.
2. The exact token bucket refill formula used (`min(capacity, tokens + elapsedSeconds * refillRate)`) and why time-based (not tick-based) refill matters for accuracy.
3. Why Redis (not in-memory state) is required for rate limiting to work correctly across multiple app instances.
4. How `WATCH`/`MULTI`/`EXEC` implements optimistic locking in Redis, and how that differs from pessimistic locking (e.g. `SETNX`-based locks).
5. What a `WatchError` means, why it happens, and why the fix is "retry with a fresh read" rather than "fail immediately."
6. Why retries are capped (`MAX_RETRIES = 3`) instead of retried indefinitely, and what happens when retries are exhausted.
7. Why the bucket is stored as a Redis Hash (`HGETALL`/`HSET`) rather than a JSON string blob, and the tradeoffs of each.
8. Why the TTL is set to `2 × (capacity / refillRate)` and what would happen if it were too short or omitted entirely.
9. The known limitation of running `WATCH` transactions over a single shared Redis connection, and how you'd fix it (isolated connections per request, or a Lua script).
10. Why `reconnectStrategy: false` was chosen for the Redis client, and the tradeoff between "fail fast at startup" and "auto-heal after a later outage."
11. How the graceful shutdown sequence works (`SIGINT`/`SIGTERM` → stop accepting new connections → let in-flight requests finish → disconnect Redis → exit) and why the ordering matters.
12. Why `app.set('trust proxy', true)` is necessary when the app sits behind Nginx, and the security implications of trusting `X-Forwarded-For` blindly in a real deployment.
13. The difference between the `notFound` middleware and the `errorHandler` middleware, and why Express requires error middleware to have exactly 4 parameters.
14. How the `AppError` class distinguishes "operational" errors (safe to show the client) from unexpected bugs (must be hidden behind a generic 500).
15. Why metrics are recorded on the `res.on('finish')` event rather than immediately in the middleware, and why `req.route.path` is preferred over `req.path` when available.
16. The difference between a Prometheus Counter and Histogram, and why request duration needs a Histogram instead of a Gauge or Counter.
17. How Prometheus's pull-based scraping model differs from a push-based metrics system, and why that fits containerized services well.
18. Why Nginx sits in front of the app instead of exposing the app directly, both for this project and in general production setups.
19. How Docker Compose's `depends_on` with `condition: service_healthy` differs from a plain `depends_on`, and why Redis specifically needed a healthcheck.
20. What would need to change to run this system with real horizontal scaling (multiple app replicas) — and why it would work with almost no code changes, thanks to the Redis-backed design.

## Lessons Learned

Building ThrottleX reinforced several core backend engineering concepts:

- **Distributed state requires distributed coordination.** Moving rate-limit counters from memory to Redis isn't just a storage change — it introduces real concurrency problems (two processes racing to update the same bucket) that don't exist in a single-process design, and those problems need an explicit solution (optimistic locking), not just "use a database."
- **Optimistic locking vs. pessimistic locking.** `WATCH`/`MULTI`/`EXEC` trades a small chance of retries for avoiding the cost and complexity of holding locks — a good fit when conflicts are expected to be rare (most identifiers aren't hit concurrently by the same client).
- **Idempotent-feeling algorithms still need careful edge-case handling.** Refilling tokens based on elapsed wall-clock time (rather than a fixed tick) means every request recomputes state from scratch — simple in theory, but details like flooring vs. ceiling, and what "no bucket yet" means, matter for correctness.
- **Fail fast vs. retry forever is a real design decision, not a default to accept blindly.** The default Redis client behavior (retry connecting forever) was actively wrong for this project's startup requirements and had to be deliberately overridden.
- **Observability is a feature, not an afterthought.** Adding Prometheus metrics and a Grafana dashboard after the core logic was already correct made it possible to actually see rate-limiting behavior in real time, instead of inferring it from logs or manual curl commands.
- **Separation of concerns pays off across incremental changes.** Because business logic (`tokenBucketService.js`), infrastructure (`redis/`), and delivery (`routes/`, `middleware/`) were kept in distinct modules from the start, later changes — swapping JSON storage for Redis Hashes, adding metrics, adding Docker — were each isolated, low-risk edits rather than risky rewrites.
- **Production readiness is a checklist, not a single feature.** Graceful shutdown, centralized error handling, health checks, and hiding internal errors from clients are all small individually, but together they're the difference between a demo and something you'd actually deploy.
- **Infrastructure-as-config (Docker Compose, Nginx, Prometheus/Grafana provisioning) removes "works on my machine" risk.** Defining the entire stack — including dashboard and datasource provisioning — as versioned files means anyone can reproduce the exact same running system with one command.
