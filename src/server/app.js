const path = require('path');
const express = require('express');
const healthRoutes = require('../routes/health.routes');
const limitedRoutes = require('../routes/limited.routes');
const metricsRoutes = require('../routes/metrics.routes');
const metrics = require('../middleware/metrics');
const notFound = require('../middleware/notFound');
const errorHandler = require('../middleware/errorHandler');

const app = express();

app.set('trust proxy', true);

app.use(express.json());
app.use(metrics);

// Static landing page. Purely additive: only serves files under public/
// (currently just index.html), so it cannot shadow any existing API route.
app.use(express.static(path.join(__dirname, '../../public')));

app.use(healthRoutes);
app.use(limitedRoutes);
app.use(metricsRoutes);

// Must be registered last: notFound catches unmatched routes,
// errorHandler catches everything thrown or passed to next().
app.use(notFound);
app.use(errorHandler);

module.exports = app;
