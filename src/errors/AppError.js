// isOperational distinguishes expected, handled failures (e.g. bad input)
// from unexpected bugs, so the error handler knows what's safe to expose.
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

module.exports = AppError;
