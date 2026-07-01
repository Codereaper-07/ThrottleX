const { error } = require('../utils/response');

function notFound(req, res) {
  error(res, 'Route not found', 404);
}

module.exports = notFound;
