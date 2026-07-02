const express = require('express');
const { success } = require('../utils/response');
const rateLimiter = require('../middleware/rateLimiter');
const { demoPolicy } = require('../config/policies');

const router = express.Router();

router.get('/limited', rateLimiter(demoPolicy), (req, res) => {
  success(res, { message: 'Request accepted' });
});

module.exports = router;
