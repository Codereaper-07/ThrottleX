const client = require('prom-client');

// Adds process/runtime metrics (CPU, memory, event loop lag, etc.) to the
// default registry alongside the app-specific metrics defined below.
client.collectDefaultMetrics();

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
});

const rateLimitRequestsTotal = new client.Counter({
  name: 'rate_limit_requests_total',
  help: 'Total number of rate limiter decisions',
  labelNames: ['result'],
});

const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

module.exports = {
  register: client.register,
  httpRequestsTotal,
  rateLimitRequestsTotal,
  httpRequestDurationSeconds,
};
