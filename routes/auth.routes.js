const { Router } = require('express');
const {
  registerSchema,
  loginSchema,
  sendOtpSchema,
  verifyOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  refreshTokenSchema
} = require('../schemas/auth.schema.js');
const { validate } = require('../middleware/validate.middleware.js');
const { authenticate } = require('../middleware/auth.middleware.js');
const { authLimiter } = require('../middleware/rate-limiter.middleware.js');
const authController = require('../controllers/auth.controller.js');

const router = Router();

router.post('/register', authLimiter, validate({ body: registerSchema }), authController.register);
router.post('/login', authLimiter, validate({ body: loginSchema }), authController.login);
router.post('/send-otp', authLimiter, validate({ body: sendOtpSchema }), authController.sendOtp);
router.post('/verify-otp', authLimiter, validate({ body: verifyOtpSchema }), authController.verifyOtp);
router.post('/forgot-password', authLimiter, validate({ body: forgotPasswordSchema }), authController.forgotPassword);
router.post('/reset-password', authLimiter, validate({ body: resetPasswordSchema }), authController.resetPassword);
router.post('/refresh-token', authLimiter, validate({ body: refreshTokenSchema }), authController.refreshToken);

router.post('/logout', authenticate, authController.logout);
router.get('/profile', authenticate, authController.getProfile);

module.exports = router;
