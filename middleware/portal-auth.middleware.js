const jwt = require('jsonwebtoken');
const { env } = require('../config/env.js');
const { AppError } = require('../utils/app-error.js');
const { PortalAccount } = require('../models/index.js');

async function requireClientAuth(req, res, next) {
  try {
    let token;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return next(new AppError('Authentication required. Missing token.', 401));
    }
    const decoded = jwt.verify(token, env.JWT_SECRET);

    // If client token
    if (decoded.role === 'client' && decoded.portalAccountId) {
      const portalAccount = await PortalAccount.findByPk(decoded.portalAccountId);
      if (!portalAccount || portalAccount.status === 'disabled') {
        return next(new AppError('Portal account disabled or non-existent', 403));
      }

      req.clientAuth = decoded;
      req.portalAccount = portalAccount;
      return next();
    }

    // If admin token (e.g. admin inspecting portal APIs)
    if (decoded.role === 'admin' || decoded.id) {
      req.user = decoded;
      req.clientAuth = {
        role: 'admin',
        customerId: req.query.customerId || req.headers['x-customer-id'] || null,
        tenantId: decoded.tenantId,
      };
      return next();
    }

    return next(new AppError('Invalid token for client portal', 403));
  } catch (error) {
    return next(new AppError('Invalid or expired authentication token', 401));
  }
}

module.exports = { requireClientAuth };
