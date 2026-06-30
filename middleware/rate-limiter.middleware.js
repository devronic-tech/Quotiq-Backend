import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  message: {
    success: false,
    error: {
      message: 'Too many requests, please try again later',
      code: 'TOO_MANY_REQUESTS',
      statusCode: 429,
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  message: {
    success: false,
    error: {
      message: 'Too many authentication attempts, please try again later',
      code: 'TOO_MANY_REQUESTS',
      statusCode: 429,
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});
