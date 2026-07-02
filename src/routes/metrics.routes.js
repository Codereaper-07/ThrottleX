const express = require('express');
const { register } = require('../metrics/prometheus');

const router = express.Router();

router.get('/metrics', async (req, res, next) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    next(err);
  }
});

module.exports = router;
