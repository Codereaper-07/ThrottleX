const app = require('./app');
const config = require('../config/env');

const server = app.listen(config.port, () => {
  console.log('----------------------------------------');
  console.log('ThrottleX running');
  console.log(`Environment: ${config.env}`);
  console.log(`Port: ${config.port}`);
  console.log('----------------------------------------');
});

// Closing the server lets in-flight requests finish instead of dropping
// them, which matters when this process runs behind an orchestrator
// that sends SIGTERM on every deploy/restart.
function shutdown(signal) {
  console.log(`${signal} received: shutting down gracefully`);
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
