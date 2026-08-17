const { StatusCodes } = require('http-status-codes');
const { sequelize } = require('../config/database.js');
const { User, Organization, RefreshToken, Role, OtpVerification } = require('../models/index.js');
const { generateSlug } = require('../models/organization.model.js');
const { generateTokens, hashToken, verifyRefreshToken } = require('../utils/token.js');
const { ConflictError, NotFoundError, ValidationError, UnauthorizedError } = require('../utils/app-error.js');
const { asyncHandler } = require('../utils/async-handler.js');
const { logger } = require('../utils/logger.js');
const { sendOTPEmail } = require('../utils/email.js');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { env } = require('../config/env.js');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const MAX_SESSIONS = 5;

/**
 * POST /api/auth/register
 */
const register = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, password, organizationName, verificationToken } = req.body;

  let decoded;
  try {
    decoded = jwt.verify(verificationToken, env.JWT_SECRET);
  } catch (err) {
    throw new UnauthorizedError('Invalid or expired email verification token. Please verify your OTP again.');
  }

  if (decoded.email !== email || decoded.type !== 'signup' || !decoded.verified) {
    throw new UnauthorizedError('Verification token does not match register details');
  }

  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    throw new ConflictError('An account with this email already exists');
  }

  let slug = generateSlug(organizationName);
  const existingOrg = await Organization.findOne({ where: { slug } });
  if (existingOrg) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }

  const result = await sequelize.transaction(async (t) => {
    const organization = await Organization.create(
      { name: organizationName, slug },
      { transaction: t }
    );

    const user = await User.create(
      {
        email,
        password,
        firstName,
        lastName,
        role: Role.OWNER,
        tenantId: organization.id,
        isActive: true,
        isEmailVerified: false,
      },
      { transaction: t }
    );

    const tokens = generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: organization.id,
    });

    await RefreshToken.create(
      {
        userId: user.id,
        hashedToken: hashToken(tokens.refreshToken),
        device: 'registration',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      { transaction: t }
    );

    await user.update({ lastLoginAt: new Date() }, { transaction: t });

    return { user, organization, tokens };
  });

  // Clean up verified OTP record
  await OtpVerification.destroy({ where: { email, type: 'signup' } });

  logger.info({ userId: result.user.id, orgId: result.organization.id }, 'New organization registered');

  res.status(StatusCodes.CREATED).json({
    success: true,
    data: {
      user: {
        _id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        role: result.user.role,
        tenantId: result.organization.id,
        isActive: result.user.isActive,
        isEmailVerified: result.user.isEmailVerified,
        lastLoginAt: result.user.lastLoginAt ? result.user.lastLoginAt.toISOString() : null,
        createdAt: result.user.createdAt.toISOString(),
      },
      tokens: {
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
        expiresIn: result.tokens.expiresIn,
      },
    },
    message: 'Registration successful',
  });
});

/**
 * POST /api/auth/login
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ where: { email, isActive: true } });
  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (user.isLocked()) {
    const remainingMs = user.lockUntil.getTime() - Date.now();
    const remainingMin = Math.ceil(remainingMs / 60000);
    throw new UnauthorizedError(
      `Account is locked due to too many failed attempts. Try again in ${remainingMin} minutes.`
    );
  }

  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    const failedLoginAttempts = user.failedLoginAttempts + 1;
    const lockUntil =
      failedLoginAttempts >= MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + LOCK_DURATION_MS)
        : null;

    if (lockUntil) {
      logger.warn({ userId: user.id, email }, 'Account locked due to failed attempts');
    }

    await user.update({ failedLoginAttempts, lockUntil });
    throw new UnauthorizedError('Invalid email or password');
  }

  await user.update({
    failedLoginAttempts: 0,
    lockUntil: null,
    lastLoginAt: new Date(),
  });

  const tokens = generateTokens({
    userId: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
  });

  // Enforce max sessions limit
  const sessionCount = await RefreshToken.count({ where: { userId: user.id } });
  if (sessionCount >= MAX_SESSIONS) {
    const oldest = await RefreshToken.findOne({
      where: { userId: user.id },
      order: [['createdAt', 'ASC']],
    });
    if (oldest) await oldest.destroy();
  }

  await RefreshToken.create({
    userId: user.id,
    hashedToken: hashToken(tokens.refreshToken),
    device: 'web',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  logger.info({ userId: user.id, email }, 'User logged in');

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      user: user.toPublicJSON(),
      tokens,
    },
    message: 'Login successful',
  });
});

/**
 * POST /api/auth/refresh-token
 */
const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken: token } = req.body;

  if (!token) {
    throw new ValidationError('Refresh token is required');
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const hashedOldToken = hashToken(token);
  const storedToken = await RefreshToken.findOne({
    where: { hashedToken: hashedOldToken, userId: decoded.userId },
  });

  if (!storedToken) {
    await RefreshToken.destroy({ where: { userId: decoded.userId } });
    throw new UnauthorizedError('Refresh token has been revoked. Please login again.');
  }

  const user = await User.findOne({
    where: { id: decoded.userId, isActive: true },
  });

  if (!user) {
    await storedToken.destroy();
    throw new UnauthorizedError('User not found or inactive');
  }

  await storedToken.destroy();

  const tokens = generateTokens({
    userId: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
  });

  await RefreshToken.create({
    userId: user.id,
    hashedToken: hashToken(tokens.refreshToken),
    device: 'web',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days expiry matching JWT refresh setting
  });

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    },
    message: 'Token refreshed successfully',
  });
});

/**
 * POST /api/auth/logout
 */
const logout = asyncHandler(async (req, res) => {
  const { refreshToken: token } = req.body;

  if (req.user && token) {
    const hashedToken = hashToken(token);
    await RefreshToken.destroy({
      where: { userId: req.user.userId, hashedToken },
    });
  }

  res.status(StatusCodes.OK).json({
    success: true,
    data: null,
    message: 'Logged out successfully',
  });
});

/**
 * GET /api/auth/profile
 */
const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.userId);

  if (!user) {
    throw new NotFoundError('User');
  }

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      user: user.toPublicJSON(),
    },
  });
});

/**
 * POST /api/auth/send-otp
 */
const sendOtp = asyncHandler(async (req, res) => {
  const { email, type } = req.body;

  if (type === 'signup') {
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      throw new ConflictError('An account with this email already exists');
    }
  } else if (type === 'login' || type === 'forgot_password') {
    const existingUser = await User.findOne({ where: { email, isActive: true } });
    if (!existingUser) {
      throw new NotFoundError('No account found with this email');
    }
  }

  // Delete existing OTPs
  await OtpVerification.destroy({ where: { email, type } });

  // Generate 6-digit OTP
  const otp = crypto.randomInt(100000, 1000000).toString();
  const salt = await bcrypt.genSalt(10);
  const hashedOtp = await bcrypt.hash(otp, salt);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Save OTP to database
  await OtpVerification.create({
    email,
    otp: hashedOtp,
    type,
    expiresAt,
  });

  // Send OTP email
  await sendOTPEmail(email, otp, type);

  logger.info({ email, type }, 'OTP sent successfully');

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Verification code sent to your email',
  });
});

/**
 * POST /api/auth/verify-otp
 */
const verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp, type } = req.body;

  const otpRecord = await OtpVerification.findOne({
    where: { email, type, verified: false },
    order: [['createdAt', 'DESC']],
  });

  if (!otpRecord) {
    throw new ValidationError('No OTP request found. Please request a new OTP.');
  }

  if (new Date() > otpRecord.expiresAt) {
    await otpRecord.destroy();
    throw new ValidationError('OTP has expired. Please request a new one.');
  }

  const isMatch = await bcrypt.compare(otp, otpRecord.otp);
  if (!isMatch) {
    const attempts = otpRecord.attempts + 1;
    if (attempts >= 3) {
      await otpRecord.destroy();
      throw new ValidationError('Too many incorrect attempts. Please request a new OTP.');
    } else {
      await otpRecord.update({ attempts });
      throw new ValidationError(`Invalid OTP. Please try again. (${3 - attempts} attempts remaining)`);
    }
  }

  // Mark as verified
  await otpRecord.update({ verified: true });

  if (type === 'login') {
    const user = await User.findOne({ where: { email, isActive: true } });
    if (!user) {
      throw new UnauthorizedError('User not found or inactive');
    }

    await user.update({ lastLoginAt: new Date() });

    const tokens = generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    });

    await RefreshToken.create({
      userId: user.id,
      hashedToken: hashToken(tokens.refreshToken),
      device: 'web',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    // Delete verified OTP record
    await otpRecord.destroy();

    logger.info({ userId: user.id }, 'User logged in via OTP');

    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        user: user.toPublicJSON(),
        tokens,
      },
      message: 'Login successful',
    });
  } else {
    // Generate signup or reset temporary token
    const verificationToken = jwt.sign(
      { email, type, verified: true },
      env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        verificationToken,
      },
      message: 'OTP verified successfully',
    });
  }
});

/**
 * POST /api/auth/forgot-password
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ where: { email, isActive: true } });
  if (!user) {
    throw new NotFoundError('No account found with this email');
  }

  // Delete existing password reset OTPs
  await OtpVerification.destroy({ where: { email, type: 'forgot_password' } });

  // Generate OTP
  const otp = crypto.randomInt(100000, 1000000).toString();
  const salt = await bcrypt.genSalt(10);
  const hashedOtp = await bcrypt.hash(otp, salt);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Save to database
  await OtpVerification.create({
    email,
    otp: hashedOtp,
    type: 'forgot_password',
    expiresAt,
  });

  // Send email
  await sendOTPEmail(email, otp, 'forgot_password');

  logger.info({ email }, 'Password reset OTP sent');

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Verification code sent to your email',
  });
});

/**
 * POST /api/auth/reset-password
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, password } = req.body;

  const otpRecord = await OtpVerification.findOne({
    where: { email, type: 'forgot_password', verified: false },
    order: [['createdAt', 'DESC']],
  });

  if (!otpRecord) {
    throw new ValidationError('No OTP request found. Please request a new OTP.');
  }

  if (new Date() > otpRecord.expiresAt) {
    await otpRecord.destroy();
    throw new ValidationError('OTP has expired. Please request a new one.');
  }

  const isMatch = await bcrypt.compare(otp, otpRecord.otp);
  if (!isMatch) {
    const attempts = otpRecord.attempts + 1;
    if (attempts >= 3) {
      await otpRecord.destroy();
      throw new ValidationError('Too many incorrect attempts. Please request a new OTP.');
    } else {
      await otpRecord.update({ attempts });
      throw new ValidationError(`Invalid OTP. Please try again. (${3 - attempts} attempts remaining)`);
    }
  }

  // OTP verified successfully, let's update password
  const user = await User.findOne({ where: { email, isActive: true } });
  if (!user) {
    throw new NotFoundError('User');
  }

  // Update password (hooks will trigger hashing automatically)
  user.password = password;
  await user.save();

  // Delete the OTP verification record
  await otpRecord.destroy();

  logger.info({ userId: user.id }, 'Password reset completed');

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Password reset successful. You can now login with your new password.',
  });
});

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  getProfile,
  sendOtp,
  verifyOtp,
  forgotPassword,
  resetPassword,
};
