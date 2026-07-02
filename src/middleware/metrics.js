const { httpRequestsTotal, httpRequestDurationSeconds } = require('../metrics/prometheus');

function metrics(req, res, next) {
  const startTime = process.hrtime.bigint();

  // 'finish' fires once the response has been sent, so req.route and
  // res.statusCode are already final by the time we read them here.
  res.on('finish', () => {
    const route = req.route ? req.route.path : req.path;
    const labels = { method: req.method, route, status: res.statusCode };
    const durationSeconds = Number(process.hrtime.bigint() - startTime) / 1e9;

    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationSeconds);
  });

  next();
}

module.exports = metrics;
