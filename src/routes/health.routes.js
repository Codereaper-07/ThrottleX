const express = require('express');
const { success } = require('../utils/response');

const router = express.Router();

router.get('/health', (req, res) => {
  success(res, {
    status: 'ok',
    service: 'ThrottleX',
  });
});

module.exports = router;
