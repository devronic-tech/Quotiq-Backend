const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PortalAccount, Customer, Organization, PortalActivity } = require('../models/index.js');
const { env } = require('../config/env.js');
const { asyncHandler } = require('../utils/async-handler.js');
const { AppError } = require('../utils/app-error.js');

/**
 * Client Portal Login
 * Supports:
 * - Email + Password (or Email + Client Code + Password)
 */
const clientLogin = asyncHandler(async (req, res) => {
  const { email, password, clientCode } = req.body;

  if (!email || !password) {
    throw new AppError('Email and password are required', 400);
  }

  // Find portal account by email
  const portalAccount = await PortalAccount.findOne({
    where: { email: email.trim().toLowerCase() },
    include: [{ model: Customer, as: 'customer', include: [{ model: Organization, as: 'organization' }] }],
  });

  if (!portalAccount) {
    throw new AppError('Invalid credentials or portal account not found', 401);
  }

  if (portalAccount.status === 'disabled') {
    throw new AppError('Client portal access is currently disabled for your account. Please contact support.', 403);
  }

  if (portalAccount.portalExpiry && new Date() > new Date(portalAccount.portalExpiry)) {
    throw new AppError('Client portal access has expired. Please contact administration.', 403);
  }

  // Optional: check client code if provided or required
  if (clientCode && clientCode.trim().toUpperCase() !== portalAccount.clientCode.toUpperCase()) {
    throw new AppError('Invalid client code', 401);
  }

  // Verify password
  const isMatch = await bcrypt.compare(password, portalAccount.password);
  if (!isMatch) {
    throw new AppError('Invalid email or password', 401);
  }

  // Update last login
  portalAccount.lastLogin = new Date();
  if (!portalAccount.isActivated) {
    portalAccount.isActivated = true;
  }
  await portalAccount.save();

  // Log activity
  await PortalActivity.create({
    customerId: portalAccount.customerId,
    tenantId: portalAccount.tenantId,
    actorRole: 'client',
    actorName: `${portalAccount.firstName || ''} ${portalAccount.lastName || ''}`.trim() || portalAccount.email,
    actorId: portalAccount.id,
    actionType: 'login',
    description: `Client logged into workspace portal`,
    metadata: { ip: req.ip, userAgent: req.get('user-agent') },
  });

  // Generate JWT token
  const payload = {
    portalAccountId: portalAccount.id,
    customerId: portalAccount.customerId,
    tenantId: portalAccount.tenantId,
    role: 'client',
    email: portalAccount.email,
    clientCode: portalAccount.clientCode,
  };

  const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '7d' });

  return res.json({
    success: true,
    message: 'Login successful',
    token,
    data: {
      portalAccountId: portalAccount.id,
      customerId: portalAccount.customerId,
      clientCode: portalAccount.clientCode,
      email: portalAccount.email,
      firstName: portalAccount.firstName,
      lastName: portalAccount.lastName,
      companyName: portalAccount.companyName || portalAccount.customer?.company,
      customerName: portalAccount.customer?.name,
      storageQuotaBytes: portalAccount.storageQuotaBytes,
      organization: portalAccount.customer?.organization ? {
        name: portalAccount.customer.organization.name,
        logo: portalAccount.customer.organization.logoUrl || null,
      } : null,
    },
  });
});

/**
 * Account Activation with Client Code + Setup Password
 */
const activateAccount = asyncHandler(async (req, res) => {
  const { email, clientCode, password, firstName, lastName } = req.body;

  if (!email || !clientCode || !password) {
    throw new AppError('Email, Client Code, and Password are required', 400);
  }

  const portalAccount = await PortalAccount.findOne({
    where: {
      email: email.trim().toLowerCase(),
      clientCode: clientCode.trim().toUpperCase(),
    },
    include: [{ model: Customer, as: 'customer' }],
  });

  if (!portalAccount) {
    throw new AppError('Invalid email or Client Code for activation', 404);
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(password, 10);
  portalAccount.password = hashedPassword;
  portalAccount.isActivated = true;
  if (firstName) portalAccount.firstName = firstName;
  if (lastName) portalAccount.lastName = lastName;
  portalAccount.lastLogin = new Date();
  await portalAccount.save();

  // Log activity
  await PortalActivity.create({
    customerId: portalAccount.customerId,
    tenantId: portalAccount.tenantId,
    actorRole: 'client',
    actorName: `${portalAccount.firstName || ''} ${portalAccount.lastName || ''}`.trim() || portalAccount.email,
    actorId: portalAccount.id,
    actionType: 'account_activated',
    description: `Client activated workspace portal account`,
  });

  const payload = {
    portalAccountId: portalAccount.id,
    customerId: portalAccount.customerId,
    tenantId: portalAccount.tenantId,
    role: 'client',
    email: portalAccount.email,
    clientCode: portalAccount.clientCode,
  };

  const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '7d' });

  return res.json({
    success: true,
    message: 'Account activated successfully',
    token,
    data: {
      portalAccountId: portalAccount.id,
      customerId: portalAccount.customerId,
      clientCode: portalAccount.clientCode,
      email: portalAccount.email,
      firstName: portalAccount.firstName,
      lastName: portalAccount.lastName,
    },
  });
});

/**
 * Get current authenticated client profile
 */
const getClientProfile = asyncHandler(async (req, res) => {
  const portalAccountId = req.clientAuth.portalAccountId;

  const portalAccount = await PortalAccount.findByPk(portalAccountId, {
    include: [{ model: Customer, as: 'customer', include: [{ model: Organization, as: 'organization' }] }],
  });

  if (!portalAccount) {
    throw new AppError('Portal account not found', 404);
  }

  return res.json({
    success: true,
    data: {
      portalAccountId: portalAccount.id,
      customerId: portalAccount.customerId,
      clientCode: portalAccount.clientCode,
      email: portalAccount.email,
      firstName: portalAccount.firstName,
      lastName: portalAccount.lastName,
      phone: portalAccount.phone,
      companyName: portalAccount.companyName || portalAccount.customer?.company,
      customerName: portalAccount.customer?.name,
      status: portalAccount.status,
      lastLogin: portalAccount.lastLogin,
      storageQuotaBytes: portalAccount.storageQuotaBytes,
      organization: portalAccount.customer?.organization ? {
        name: portalAccount.customer.organization.name,
        logo: portalAccount.customer.organization.logoUrl || null,
      } : null,
    },
  });
});

module.exports = {
  clientLogin,
  activateAccount,
  getClientProfile,
};
