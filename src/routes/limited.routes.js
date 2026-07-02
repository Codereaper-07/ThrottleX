const express = require('express');
const { success } = require('../utils/response');
const rateLimiter = require('../middleware/rateLimiter');

const router = express.Router();

const limitedRoutePolicy = {
  capacity: 5,
  refillRate: 1,
  identifier: (req) => req.ip,
};

router.get('/limited', rateLimiter(limitedRoutePolicy), (req, res) => {
  success(res, { message: 'Request accepted' });
});

module.exports = router;
