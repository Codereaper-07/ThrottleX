const dotenv = require('dotenv');

dotenv.config();

// Fail fast if PORT is set but invalid, instead of letting the server
// crash later with a confusing NaN port error.
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

if (Number.isNaN(port)) {
  throw new Error('PORT must be a valid number');
}

const config = {
  port,
  env: process.env.NODE_ENV || 'development',
};

module.exports = config;
