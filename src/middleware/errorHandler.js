const { error } = require('../utils/response');

// Express identifies error-handling middleware by its 4-argument signature,
// so `next` must stay even though it's unused here.
function errorHandler(err, req, res, next) {
  const statusCode = err.isOperational ? err.statusCode : 500;
  const message = err.isOperational ? err.message : 'Internal Server Error';

  error(res, message, statusCode);
}

module.exports = errorHandler;
