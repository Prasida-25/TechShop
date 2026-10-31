const { csrfSync } = require('csrf-sync');

function createCsrf() {
  const { csrfSynchronisedProtection, generateToken } = csrfSync({
    getTokenFromRequest: (req) => typeof req.body?._csrf === 'string' ? req.body._csrf : undefined,
    size: 32,
  });
  function exposeToken(req, res, next) {
    res.locals.csrfToken = generateToken(req);
    next();
  }
  return { protect: csrfSynchronisedProtection, exposeToken };
}

module.exports = { createCsrf };
