const demoPolicy = {
  capacity: 5,
  refillRate: 1,
  identifier: (req) => req.ip,
};

module.exports = { demoPolicy };
