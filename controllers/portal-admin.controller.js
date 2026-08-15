const bcrypt = require('bcryptjs');
const { Customer, PortalAccount, PortalFolder, PortalFile, PortalActivity, PortalNotification } = require('../models/index.js');
const { sequelize } = require('../config/database.js');
const { Sequelize } = require('sequelize');
const { generateClientCode } = require('../utils/portal.utils.js');
const { asyncHandler } = require('../utils/async-handler.js');
const { AppError } = require('../utils/app-error.js');
const { deleteObjectFromWasabi } = require('../services/wasabi.service.js');

/**
 * Get or auto-initialize portal account for a customer
 */
const getPortalAccount = asyncHandler(async (req, res) => {
  const { id: customerId } = req.params;
  const tenantId = req.user.tenantId;

  const customer = await Customer.findOne({
    where: { id: customerId, tenantId },
  });

  if (!customer) {
    throw new AppError('Customer profile not found', 404);
  }

  let portalAccount = await PortalAccount.findOne({
    where: { customerId, tenantId },
  });

  if (!portalAccount) {
    // Auto-create initial PortalAccount with generated client code
    const clientCode = generateClientCode();
    const tempPassword = await bcrypt.hash('Client@1234', 10);

    portalAccount = await PortalAccount.create({
      customerId: customer.id,
      tenantId,
      clientCode,
      email: customer.email || `client-${customer.id.slice(0, 8)}@quotiq.internal`,
      password: tempPassword,
      firstName: customer.name.split(' ')[0] || customer.name,
      lastName: customer.name.split(' ').slice(1).join(' ') || '',
      companyName: customer.company,
      phone: customer.phone,
      status: 'enabled',
      isActivated: false,
    });

    // Create default root folders for customer workspace if not exist
    const defaultFolders = [
      { name: 'Quotations & Contracts', visibility: 'public' },
      { name: 'Invoices & Billing', visibility: 'public' },
      { name: 'Project Assets & Media', visibility: 'client_upload' },
      { name: 'Reference & Source Code', visibility: 'upload_only' },
      { name: 'Internal Notes', visibility: 'hidden' },
    ];

    for (const f of defaultFolders) {
      await PortalFolder.create({
        customerId: customer.id,
        tenantId,
        name: f.name,
        visibility: f.visibility,
        createdByRole: 'admin',
        createdById: req.user.id,
      });
    }
  }

  // Calculate storage usage & total uploads
  const totalFiles = await PortalFile.count({ where: { customerId } });
  const totalStorageResult = await PortalFile.findAll({
    where: { customerId },
    attributes: [[sequelize.fn('SUM', sequelize.col('fileSize')), 'totalSize']],
    raw: true,
  });

  const totalStorageBytes = parseInt(totalStorageResult[0]?.totalSize || 0, 10);

  // Check pending deletion requests count
  const pendingFolderDeletions = await PortalFolder.count({ where: { customerId, deletionRequested: true } });
  const pendingFileDeletions = await PortalFile.count({ where: { customerId, deletionRequested: true } });

  return res.json({
    success: true,
    data: {
      portalAccount: {
        id: portalAccount.id,
        customerId: portalAccount.customerId,
        clientCode: portalAccount.clientCode,
        email: portalAccount.email,
        firstName: portalAccount.firstName,
        lastName: portalAccount.lastName,
        phone: portalAccount.phone,
        companyName: portalAccount.companyName,
        status: portalAccount.status,
        isActivated: portalAccount.isActivated,
        lastLogin: portalAccount.lastLogin,
        portalExpiry: portalAccount.portalExpiry,
        storageQuotaBytes: portalAccount.storageQuotaBytes,
        createdAt: portalAccount.createdAt,
      },
      stats: {
        totalUploads: totalFiles,
        storageUsedBytes: totalStorageBytes,
        pendingDeletionRequests: pendingFolderDeletions + pendingFileDeletions,
      },
    },
  });
});

/**
 * Toggle / Update Portal Account Settings
 */
const updatePortalAccount = asyncHandler(async (req, res) => {
  const { id: customerId } = req.params;
  const tenantId = req.user.tenantId;
  const { status, email, portalExpiry, storageQuotaBytes } = req.body;

  let portalAccount = await PortalAccount.findOne({ where: { customerId, tenantId } });
  if (!portalAccount) {
    throw new AppError('Portal account not initialized', 404);
  }

  if (status !== undefined) portalAccount.status = status;
  if (email) portalAccount.email = email.trim().toLowerCase();
  if (portalExpiry !== undefined) portalAccount.portalExpiry = portalExpiry ? new Date(portalExpiry) : null;
  if (storageQuotaBytes) portalAccount.storageQuotaBytes = storageQuotaBytes;

  await portalAccount.save();

  // Log activity
  await PortalActivity.create({
    customerId,
    tenantId,
    actorRole: 'admin',
    actorName: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Admin',
    actorId: req.user.id,
    actionType: 'portal_settings_updated',
    description: `Updated customer portal account settings (Status: ${portalAccount.status})`,
  });

  return res.json({
    success: true,
    message: 'Portal account updated successfully',
    data: portalAccount,
  });
});

/**
 * Regenerate Client Code (Unique CLI-XXXXXX identifier)
 */
const regenerateClientCode = asyncHandler(async (req, res) => {
  const { id: customerId } = req.params;
  const tenantId = req.user.tenantId;

  let portalAccount = await PortalAccount.findOne({ where: { customerId, tenantId } });
  if (!portalAccount) {
    throw new AppError('Portal account not found', 404);
  }

  const newCode = generateClientCode();
  portalAccount.clientCode = newCode;
  await portalAccount.save();

  await PortalActivity.create({
    customerId,
    tenantId,
    actorRole: 'admin',
    actorName: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Admin',
    actorId: req.user.id,
    actionType: 'client_code_regenerated',
    description: `Regenerated unique client code: ${newCode}`,
  });

  return res.json({
    success: true,
    message: 'Client code regenerated successfully',
    clientCode: newCode,
  });
});

/**
 * Reset Client Password
 */
const resetClientPassword = asyncHandler(async (req, res) => {
  const { id: customerId } = req.params;
  const tenantId = req.user.tenantId;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    throw new AppError('New password must be at least 6 characters', 400);
  }

  let portalAccount = await PortalAccount.findOne({ where: { customerId, tenantId } });
  if (!portalAccount) {
    throw new AppError('Portal account not found', 404);
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  portalAccount.password = hashedPassword;
  portalAccount.isActivated = true;
  await portalAccount.save();

  await PortalActivity.create({
    customerId,
    tenantId,
    actorRole: 'admin',
    actorName: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Admin',
    actorId: req.user.id,
    actionType: 'password_reset_by_admin',
    description: `Reset portal password for client account`,
  });

  return res.json({
    success: true,
    message: 'Client password reset successfully',
  });
});

/**
 * Get folder visibility & permissions list for Admin CRM
 */
const getFolderVisibilityList = asyncHandler(async (req, res) => {
  const { id: customerId } = req.params;
  const tenantId = req.user.tenantId;

  const folders = await PortalFolder.findAll({
    where: { customerId, tenantId },
    order: [['createdAt', 'ASC']],
  });

  return res.json({
    success: true,
    data: folders,
  });
});

/**
 * Update folder visibility / lock state
 */
const updateFolderVisibility = asyncHandler(async (req, res) => {
  const { id: customerId, folderId } = req.params;
  const tenantId = req.user.tenantId;
  const { visibility, isLocked, name } = req.body;

  const folder = await PortalFolder.findOne({
    where: { id: folderId, customerId, tenantId },
  });

  if (!folder) {
    throw new AppError('Folder not found', 404);
  }

  if (visibility) folder.visibility = visibility;
  if (isLocked !== undefined) folder.isLocked = isLocked;
  if (name) folder.name = name;

  await folder.save();

  await PortalActivity.create({
    customerId,
    tenantId,
    actorRole: 'admin',
    actorName: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Admin',
    actorId: req.user.id,
    actionType: 'folder_visibility_updated',
    description: `Updated folder "${folder.name}" visibility to ${folder.visibility}`,
  });

  return res.json({
    success: true,
    message: 'Folder updated successfully',
    data: folder,
  });
});

/**
 * Admin create new workspace folder
 */
const createAdminFolder = asyncHandler(async (req, res) => {
  const { id: customerId } = req.params;
  const tenantId = req.user.tenantId;
  const { name, visibility = 'public', parentId } = req.body;

  if (!name) {
    throw new AppError('Folder name is required', 400);
  }

  const folder = await PortalFolder.create({
    customerId,
    tenantId,
    name: name.trim(),
    visibility,
    parentId: parentId || null,
    createdByRole: 'admin',
    createdById: req.user.id,
  });

  await PortalActivity.create({
    customerId,
    tenantId,
    actorRole: 'admin',
    actorName: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Admin',
    actorId: req.user.id,
    actionType: 'folder_created',
    description: `Created folder "${folder.name}"`,
  });

  return res.json({
    success: true,
    message: 'Folder created successfully',
    data: folder,
  });
});

/**
 * Handle Deletion Requests (Approve Delete or Reject Delete)
 */
const resolveDeletionRequest = asyncHandler(async (req, res) => {
  const { id: customerId } = req.params;
  const tenantId = req.user.tenantId;
  const { itemType, itemId, action } = req.body; // itemType: 'folder' | 'file', action: 'approve' | 'reject'

  if (!itemType || !itemId || !action) {
    throw new AppError('itemType, itemId, and action (approve/reject) are required', 400);
  }

  if (itemType === 'folder') {
    const folder = await PortalFolder.findOne({ where: { id: itemId, customerId, tenantId } });
    if (!folder) throw new AppError('Folder not found', 404);

    if (action === 'approve') {
      await folder.destroy();
      await PortalActivity.create({
        customerId,
        tenantId,
        actorRole: 'admin',
        actorName: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Admin',
        actorId: req.user.id,
        actionType: 'deletion_approved',
        description: `Approved deletion request for folder "${folder.name}"`,
      });
    } else {
      folder.deletionRequested = false;
      folder.deletionReason = null;
      await folder.save();
    }
  } else if (itemType === 'file') {
    const file = await PortalFile.findOne({ where: { id: itemId, customerId, tenantId } });
    if (!file) throw new AppError('File not found', 404);

    if (action === 'approve') {
      // Physical delete from Wasabi if object key present
      if (file.wasabiObjectKey) {
        try {
          await deleteObjectFromWasabi(file.wasabiObjectKey);
        } catch (e) {
          // log error but continue DB delete
        }
      }
      await file.destroy();
      await PortalActivity.create({
        customerId,
        tenantId,
        actorRole: 'admin',
        actorName: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Admin',
        actorId: req.user.id,
        actionType: 'deletion_approved',
        description: `Approved deletion request for file "${file.originalFileName}"`,
      });
    } else {
      file.deletionRequested = false;
      file.deletionReason = null;
      await file.save();
    }
  }

  return res.json({
    success: true,
    message: `Deletion request ${action}d successfully`,
  });
});

module.exports = {
  getPortalAccount,
  updatePortalAccount,
  regenerateClientCode,
  resetClientPassword,
  getFolderVisibilityList,
  updateFolderVisibility,
  createAdminFolder,
  resolveDeletionRequest,
};
