import { Router } from 'express';
import { registerSchema, loginSchema, refreshTokenSchema } from '../schemas/auth.schema.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authLimiter } from '../middleware/rate-limiter.middleware.js';
import * as authController from '../controllers/auth.controller.js';

const router = Router();

router.post('/register', authLimiter, validate({ body: registerSchema }), authController.register);
router.post('/login', authLimiter, validate({ body: loginSchema }), authController.login);
router.post('/refresh-token', authLimiter, validate({ body: refreshTokenSchema }), authController.refreshToken);

router.post('/logout', authenticate, authController.logout);
router.get('/profile', authenticate, authController.getProfile);

export default router;
