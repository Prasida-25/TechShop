const crypto = require('node:crypto');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { normalizePhone } = require('../utils/account-validation');

function createLoginLimits(options = {}) {
  const handler = (req, res) => res.status(429).render('account/message', {
    title: 'Thử lại sau — TechZone', filters: {},
    message: 'Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 15 phút.',
  });
  const common = { windowMs: 15 * 60 * 1000, standardHeaders: 'draft-8', legacyHeaders: false, handler };
  return {
    loginIp: rateLimit({ ...common, limit: options.ipMax || 30, skipSuccessfulRequests: true }),
    loginPair: rateLimit({ ...common, limit: options.pairMax || 5, skipSuccessfulRequests: true,
      keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${crypto.createHash('sha256').update(normalizePhone(req.body?.phone)).digest('hex')}`,
    }),
    register: rateLimit({ ...common, limit: options.registerMax || 10 }),
  };
}

module.exports = { createLoginLimits };
