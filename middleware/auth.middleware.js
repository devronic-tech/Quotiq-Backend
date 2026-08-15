const jwt = require('jsonwebtoken');
const { UnauthorizedError } = require('../utils/app-error.js');
const { env } = require('../config/env.js');

function authenticate(req, _res, next) {
  let token;
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    throw new UnauthorizedError('No authentication token provided');
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    req.user = decoded;
    req.tenantId = decoded.tenantId;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Authentication token has expired');
    }
    throw new UnauthorizedError('Invalid authentication token');
  }
}

function optionalAuth(req, _res, next) {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, env.JWT_SECRET);
        req.user = decoded;
        req.tenantId = decoded.tenantId;
      } catch {
        // Silently ignore invalid tokens for optional auth
      }
    }
  }

  next();
}

module.exports = {
  authenticate,
  optionalAuth
};
