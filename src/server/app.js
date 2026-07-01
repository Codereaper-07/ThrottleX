const express = require('express');
const healthRoutes = require('../routes/health.routes');
const notFound = require('../middleware/notFound');
const errorHandler = require('../middleware/errorHandler');

const app = express();

app.use(express.json());
app.use(healthRoutes);

// Must be registered last: notFound catches unmatched routes,
// errorHandler catches everything thrown or passed to next().
app.use(notFound);
app.use(errorHandler);

module.exports = app;
