import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../utils/app-error.js';
import { env } from '../config/env.js';

export function authenticate(req, _res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('No authentication token provided');
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    throw new UnauthorizedError('Invalid authentication token format');
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

export function optionalAuth(req, _res, next) {
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
