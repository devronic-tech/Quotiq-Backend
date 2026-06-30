import { StatusCodes } from 'http-status-codes';
import { sequelize } from '../config/database.js';
import { User, Organization, RefreshToken, Role } from '../models/index.js';
import { generateSlug } from '../models/organization.model.js';
import { generateTokens, hashToken, verifyRefreshToken } from '../utils/token.js';
import { ConflictError, NotFoundError, ValidationError, UnauthorizedError } from '../utils/app-error.js';
import { asyncHandler } from '../utils/async-handler.js';
import { logger } from '../utils/logger.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const MAX_SESSIONS = 5;

/**
 * POST /api/auth/register
 */
export const register = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, password, organizationName } = req.body;

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
export const login = asyncHandler(async (req, res) => {
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

  await RefreshToken.create({
    userId: user.id,
    hashedToken: hashToken(tokens.refreshToken),
    device: 'web',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  const allTokens = await RefreshToken.findAll({
    where: { userId: user.id },
    order: [['createdAt', 'ASC']],
  });

  const now = new Date();
  const validTokens = allTokens.filter((t) => t.expiresAt > now);
  const toDelete = [
    ...allTokens.filter((t) => t.expiresAt <= now),
    ...validTokens.slice(0, Math.max(0, validTokens.length - MAX_SESSIONS)),
  ];

  if (toDelete.length > 0) {
    await RefreshToken.destroy({
      where: { id: toDelete.map((t) => t.id) },
    });
  }

  logger.info({ userId: user.id }, 'User logged in');

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      user: {
        _id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: user.tenantId,
        isActive: user.isActive,
        isEmailVerified: user.isEmailVerified,
        lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
        createdAt: user.createdAt.toISOString(),
      },
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      },
    },
    message: 'Login successful',
  });
});

/**
 * POST /api/auth/refresh-token
 */
export const refreshToken = asyncHandler(async (req, res) => {
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
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
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
export const logout = asyncHandler(async (req, res) => {
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
export const getProfile = asyncHandler(async (req, res) => {
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
