const fs = require('fs');
const { Op } = require('sequelize');
const {
  PortalFile,
  PortalFileVersion,
  PortalFolder,
  PortalTextPost,
  PortalLink,
  PortalActivity,
  PortalNotification,
  PortalAccount,
  PortalDocumentComment,
  Quotation,
  Invoice,
} = require('../models/index.js');
const {
  getSignedUploadUrl,
  getSignedDownloadUrl,
  deleteObjectFromWasabi,
  uploadBufferToWasabi,
  getFileStreamFromWasabi,
} = require('../services/wasabi.service.js');
const { asyncHandler } = require('../utils/async-handler.js');
const { AppError } = require('../utils/app-error.js');

/**
 * Helper to identify request context (Client Portal vs Admin CRM)
 */
function getContext(req) {
  if (req.clientAuth) {
    return {
      role: 'client',
      customerId: req.clientAuth.customerId,
      tenantId: req.clientAuth.tenantId,
      actorName: req.portalAccount?.firstName || req.clientAuth.email,
      actorId: req.clientAuth.portalAccountId,
    };
  } else if (req.user) {
    return {
      role: 'admin',
      customerId: req.params.customerId || req.query.customerId,
      tenantId: req.user.tenantId,
      actorName: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Admin',
      actorId: req.user.id,
    };
  }
  throw new AppError('Unauthorized access', 401);
}

/**
 * Request Presigned Wasabi S3 Upload URL
 */
const requestPresignedUpload = asyncHandler(async (req, res) => {
  const ctx = getContext(req);
  const { fileName, fileSize, mimeType, folderId } = req.body;

  if (!fileName) {
    throw new AppError('File name is required', 400);
  }

  // Generate unique Wasabi object key
  const timestamp = Date.now();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const objectKey = `clients/${ctx.customerId}/${timestamp}_${safeName}`;

  const { uploadUrl } = await getSignedUploadUrl(objectKey, mimeType || 'application/octet-stream');

  return res.json({
    success: true,
    data: {
      uploadUrl,
      objectKey,
      fileName,
      folderId: folderId || null,
    },
  });
});

/**
 * Save file metadata after successful Wasabi upload
 */
const completeFileUpload = asyncHandler(async (req, res) => {
  const ctx = getContext(req);
  const {
    originalFileName,
    objectKey,
    fileSize = 0,
    mimeType = 'application/octet-stream',
    folderId,
    description,
    tags = [],
    sha256,
  } = req.body;

  if (!originalFileName || !objectKey) {
    throw new AppError('originalFileName and objectKey are required', 400);
  }

  const extParts = originalFileName.split('.');
  const extension = extParts.length > 1 ? extParts.pop().toLowerCase() : '';

  // Wasabi public/presigned URL template
  const wasabiUrl = `https://s3.ap-southeast-2.wasabisys.com/crm-development/${objectKey}`;

  // Check if replacing an existing file or creating a new version
  let existingFile = await PortalFile.findOne({
    where: {
      customerId: ctx.customerId,
      tenantId: ctx.tenantId,
      originalFileName,
      folderId: folderId || null,
    },
  });

  let fileRecord;

  if (existingFile) {
    // Save version history
    await PortalFileVersion.create({
      fileId: existingFile.id,
      versionNumber: existingFile.currentVersion,
      originalFileName: existingFile.originalFileName,
      storageFileName: existingFile.storageFileName,
      fileSize: existingFile.fileSize,
      wasabiObjectKey: existingFile.wasabiObjectKey,
      wasabiUrl: existingFile.wasabiUrl,
      uploadedByRole: existingFile.uploadedByRole,
      uploadedById: existingFile.uploadedById,
    });

    existingFile.currentVersion += 1;
    existingFile.fileSize = fileSize;
    existingFile.wasabiObjectKey = objectKey;
    existingFile.wasabiUrl = wasabiUrl;
    existingFile.uploadedByRole = ctx.role;
    existingFile.uploadedById = ctx.actorId;
    existingFile.ipAddress = req.ip;
    existingFile.userAgent = req.get('user-agent');
    if (description) existingFile.description = description;
    if (tags && tags.length) existingFile.tags = tags;
    if (sha256) existingFile.sha256 = sha256;

    await existingFile.save();
    fileRecord = existingFile;
  } else {
    fileRecord = await PortalFile.create({
      customerId: ctx.customerId,
      tenantId: ctx.tenantId,
      folderId: folderId || null,
      originalFileName,
      storageFileName: objectKey.split('/').pop(),
      fileSize,
      extension,
      mimeType,
      sha256: sha256 || null,
      tags,
      description: description || null,
      uploadedByRole: ctx.role,
      uploadedById: ctx.actorId,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      wasabiObjectKey: objectKey,
      wasabiUrl,
    });
  }

  // Create Activity
  await PortalActivity.create({
    customerId: ctx.customerId,
    tenantId: ctx.tenantId,
    actorRole: ctx.role,
    actorName: ctx.actorName,
    actorId: ctx.actorId,
    actionType: 'file_uploaded',
    description: `Uploaded file "${originalFileName}" (${(fileSize / (1024 * 1024)).toFixed(2)} MB)`,
    metadata: { fileId: fileRecord.id, extension, size: fileSize },
  });

  // Notify Admin if client uploaded
  if (ctx.role === 'client') {
    await PortalNotification.create({
      customerId: ctx.customerId,
      tenantId: ctx.tenantId,
      type: 'new_upload',
      title: 'New Client File Upload',
      message: `${ctx.actorName} uploaded "${originalFileName}"`,
      metadata: { fileId: fileRecord.id },
    });
  }

  return res.json({
    success: true,
    message: 'File metadata saved successfully',
    data: fileRecord,
  });
});

// Helper to determine exact mime type for inline preview rendering
const getInlineMimeType = (file) => {
  if (file.mimeType && file.mimeType !== 'application/octet-stream') return file.mimeType;
  const ext = file.extension?.toLowerCase() || file.originalFileName.split('.').pop()?.toLowerCase() || '';
  const mimeMap = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    txt: 'text/plain; charset=utf-8',
    json: 'application/json',
    csv: 'text/csv',
    html: 'text/html',
    css: 'text/css',
    js: 'text/javascript',
  };
  return mimeMap[ext] || 'application/octet-stream';
};

/**
 * Get signed Wasabi download URL / Stream file inline for previews
 */
const getSignedDownload = asyncHandler(async (req, res) => {
  const ctx = getContext(req);
  const { fileId } = req.params;

  const file = await PortalFile.findOne({
    where: { id: fileId, customerId: ctx.customerId },
  });

  if (!file) {
    throw new AppError('File not found', 404);
  }

  // Increment download count
  file.downloadCount += 1;
  await file.save();

  await PortalActivity.create({
    customerId: ctx.customerId,
    tenantId: ctx.tenantId,
    actorRole: ctx.role,
    actorName: ctx.actorName,
    actorId: ctx.actorId,
    actionType: 'file_downloaded',
    description: `Downloaded file "${file.originalFileName}"`,
    metadata: { fileId: file.id },
  });

  // If format=html is requested for Word documents, convert .docx to HTML via mammoth
  const isDocx = file.originalFileName?.toLowerCase().endsWith('.docx') || file.extension?.toLowerCase().includes('docx');
  if (isDocx && (req.query.format === 'html' || req.query.preview === 'html')) {
    try {
      const mammoth = require('mammoth');
      let fileBuffer;
      const streamResult = await getFileStreamFromWasabi(file.wasabiObjectKey);
      if (streamResult.isLocal) {
        fileBuffer = await fs.promises.readFile(streamResult.localFilePath);
      } else {
        const chunks = [];
        for await (const chunk of streamResult.stream) {
          chunks.push(chunk);
        }
        fileBuffer = Buffer.concat(chunks);
      }

      const conversion = await mammoth.convertToHtml({ buffer: fileBuffer });
      return res.json({
        success: true,
        data: {
          html: conversion.value,
          messages: conversion.messages,
          fileName: file.originalFileName,
        },
      });
    } catch (err) {
      // Fall back to standard binary file stream
    }
  }

  const isInline = req.query.inline === '1' || req.query.preview === '1' || !req.query.download;
  const contentType = getInlineMimeType(file);

  try {
    const streamResult = await getFileStreamFromWasabi(file.wasabiObjectKey);

    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      isInline
        ? `inline; filename="${encodeURIComponent(file.originalFileName)}"`
        : `attachment; filename="${encodeURIComponent(file.originalFileName)}"`
    );

    if (streamResult.isLocal) {
      const path = require('path');
      return res.sendFile(path.resolve(streamResult.localFilePath));
    }

    if (streamResult.contentLength) {
      res.setHeader('Content-Length', streamResult.contentLength);
    }
    return streamResult.stream.pipe(res);
  } catch (err) {
    const downloadResult = await getSignedDownloadUrl(file.wasabiObjectKey, file.originalFileName, 3600);
    if (downloadResult.isLocal) {
      const path = require('path');
      return res.sendFile(path.resolve(downloadResult.localFilePath));
    }
    return res.redirect(downloadResult.downloadUrl);
  }
});

/**
 * Get workspace files list
 */
const getWorkspaceFiles = asyncHandler(async (req, res) => {
  const ctx = getContext(req);
  const { folderId, search } = req.query;

  const whereClause = { customerId: ctx.customerId };
  if (folderId) {
    whereClause.folderId = folderId;
  }
  if (search) {
    whereClause.originalFileName = { [Op.iLike]: `%${search.trim()}%` };
  }

  // If Client, filter out hidden folders / private folders
  let allowedFolderIds = null;
  if (ctx.role === 'client') {
    const publicFolders = await PortalFolder.findAll({
      where: {
        customerId: ctx.customerId,
        visibility: { [Op.in]: ['public', 'client_upload', 'upload_only', 'read_only', 'locked', 'archive'] },
      },
      attributes: ['id'],
    });
    allowedFolderIds = publicFolders.map((f) => f.id);
  }

  if (allowedFolderIds !== null && folderId) {
    if (!allowedFolderIds.includes(folderId)) {
      return res.json({ success: true, data: [] });
    }
  }

  const files = await PortalFile.findAll({
    where: whereClause,
    include: [
      { model: PortalFolder, as: 'folder', attributes: ['id', 'name', 'visibility'] },
      { model: PortalFileVersion, as: 'versions' },
    ],
    order: [['createdAt', 'DESC']],
  });

  return res.json({
    success: true,
    data: files,
  });
});

/**
 * Get workspace folders list
 */
const getWorkspaceFolders = asyncHandler(async (req, res) => {
  const ctx = getContext(req);

  const whereClause = { customerId: ctx.customerId };
  if (ctx.role === 'client') {
    whereClause.visibility = {
      [Op.in]: ['public', 'client_upload', 'upload_only', 'read_only', 'locked', 'archive'],
    };
  }

  const folders = await PortalFolder.findAll({
    where: whereClause,
    include: [{ model: PortalFile, as: 'files', attributes: ['id', 'fileSize'] }],
    order: [['createdAt', 'ASC']],
  });

  return res.json({
    success: true,
    data: folders,
  });
});

/**
 * Client create new folder
 */
const createClientFolder = asyncHandler(async (req, res) => {
  const ctx = getContext(req);
  const { name, parentId } = req.body;

  if (!name) {
    throw new AppError('Folder name is required', 400);
  }

  const folder = await PortalFolder.create({
    customerId: ctx.customerId,
    tenantId: ctx.tenantId,
    name: name.trim(),
    visibility: 'client_upload',
    parentId: parentId || null,
    createdByRole: 'client',
    createdById: ctx.actorId,
  });

  await PortalActivity.create({
    customerId: ctx.customerId,
    tenantId: ctx.tenantId,
    actorRole: 'client',
    actorName: ctx.actorName,
    actorId: ctx.actorId,
    actionType: 'folder_created',
    description: `Created folder "${folder.name}"`,
  });

  await PortalNotification.create({
    customerId: ctx.customerId,
    tenantId: ctx.tenantId,
    type: 'folder_created',
    title: 'New Client Folder',
    message: `${ctx.actorName} created folder "${folder.name}"`,
  });

  return res.json({
    success: true,
    message: 'Folder created successfully',
    data: folder,
  });
});

/**
 * Request Item Deletion (Folder or File)
 */
const requestItemDeletion = asyncHandler(async (req, res) => {
  const ctx = getContext(req);
  const { itemType, itemId, reason } = req.body;

  if (!itemType || !itemId) {
    throw new AppError('itemType (folder|file) and itemId are required', 400);
  }

  if (itemType === 'folder') {
    const folder = await PortalFolder.findOne({ where: { id: itemId, customerId: ctx.customerId } });
    if (!folder) throw new AppError('Folder not found', 404);

    if (folder.createdByRole === 'admin' && ctx.role === 'client') {
      // Client cannot delete company folders directly, must request deletion
      folder.deletionRequested = true;
      folder.deletionReason = reason || 'Client requested folder deletion';
      await folder.save();

      await PortalNotification.create({
        customerId: ctx.customerId,
        tenantId: ctx.tenantId,
        type: 'deletion_request',
        title: 'Folder Deletion Request',
        message: `${ctx.actorName} requested deletion of folder "${folder.name}"`,
        metadata: { folderId: folder.id },
      });

      return res.json({
        success: true,
        message: 'Folder deletion request submitted to company admin',
      });
    } else {
      // Client created folder or admin user: allow direct delete
      await folder.destroy();
      return res.json({ success: true, message: 'Folder deleted successfully' });
    }
  } else if (itemType === 'file') {
    const file = await PortalFile.findOne({ where: { id: itemId, customerId: ctx.customerId } });
    if (!file) throw new AppError('File not found', 404);

    if (ctx.role === 'client' && file.uploadedByRole === 'admin') {
      file.deletionRequested = true;
      file.deletionReason = reason || 'Client requested file deletion';
      await file.save();

      await PortalNotification.create({
        customerId: ctx.customerId,
        tenantId: ctx.tenantId,
        type: 'deletion_request',
        title: 'File Deletion Request',
        message: `${ctx.actorName} requested deletion of file "${file.originalFileName}"`,
      });

      return res.json({
        success: true,
        message: 'File deletion request submitted to admin',
      });
    } else {
      if (file.wasabiObjectKey) {
        try {
          await deleteObjectFromWasabi(file.wasabiObjectKey);
        } catch (e) {}
      }
      await file.destroy();
      return res.json({ success: true, message: 'File deleted successfully' });
    }
  }
});

/**
 * Create WhatsApp-style Text Post
 */
const createTextPost = asyncHandler(async (req, res) => {
  const ctx = getContext(req);
  const { title, message, tags = [], folderId, attachments = [] } = req.body;

  if (!message || !message.trim()) {
    throw new AppError('Message body is required for text post', 400);
  }

  const post = await PortalTextPost.create({
    customerId: ctx.customerId,
    tenantId: ctx.tenantId,
    folderId: folderId || null,
    title: title ? title.trim() : null,
    message: message.trim(),
    tags,
    authorRole: ctx.role,
    authorName: ctx.actorName,
    authorId: ctx.actorId,
    attachments,
  });

  await PortalActivity.create({
    customerId: ctx.customerId,
    tenantId: ctx.tenantId,
    actorRole: ctx.role,
    actorName: ctx.actorName,
    actorId: ctx.actorId,
    actionType: 'text_post_created',
    description: `Posted message: "${title || message.slice(0, 40)}..."`,
  });

  if (ctx.role === 'client') {
    await PortalNotification.create({
      customerId: ctx.customerId,
      tenantId: ctx.tenantId,
      type: 'new_text_post',
      title: 'New Client Message',
      message: `${ctx.actorName} posted a message: ${title || message.slice(0, 30)}`,
    });
  }

  return res.json({
    success: true,
    message: 'Text post created successfully',
    data: post,
  });
});

/**
 * Get Text Posts
 */
const getTextPosts = asyncHandler(async (req, res) => {
  const ctx = getContext(req);
  const { folderId } = req.query;

  const whereClause = { customerId: ctx.customerId };
  if (folderId) whereClause.folderId = folderId;

  const posts = await PortalTextPost.findAll({
    where: whereClause,
    order: [['createdAt', 'DESC']],
  });

  return res.json({
    success: true,
    data: posts,
  });
});

/**
 * Create External Link Submission (Google Drive, Figma, GitHub, YouTube, etc.)
 */
const createLink = asyncHandler(async (req, res) => {
  const ctx = getContext(req);
  const { url, title, folderId } = req.body;

  if (!url) {
    throw new AppError('URL is required', 400);
  }

  // Derive site name and icon
  let websiteName = 'External Link';
  let icon = 'link';

  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('drive.google.com')) {
    websiteName = 'Google Drive';
    icon = 'hard-drive';
  } else if (lowerUrl.includes('dropbox.com')) {
    websiteName = 'Dropbox';
    icon = 'box';
  } else if (lowerUrl.includes('figma.com')) {
    websiteName = 'Figma';
    icon = 'figma';
  } else if (lowerUrl.includes('canva.com')) {
    websiteName = 'Canva';
    icon = 'image';
  } else if (lowerUrl.includes('github.com')) {
    websiteName = 'GitHub';
    icon = 'github';
  } else if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) {
    websiteName = 'YouTube';
    icon = 'youtube';
  }

  const link = await PortalLink.create({
    customerId: ctx.customerId,
    tenantId: ctx.tenantId,
    folderId: folderId || null,
    url: url.trim(),
    title: title ? title.trim() : websiteName,
    icon,
    websiteName,
    createdByRole: ctx.role,
    createdById: ctx.actorId,
  });

  await PortalActivity.create({
    customerId: ctx.customerId,
    tenantId: ctx.tenantId,
    actorRole: ctx.role,
    actorName: ctx.actorName,
    actorId: ctx.actorId,
    actionType: 'link_submitted',
    description: `Pasted link: ${websiteName} (${url})`,
  });

  return res.json({
    success: true,
    message: 'Link added successfully',
    data: link,
  });
});

/**
 * Get Links
 */
const getLinks = asyncHandler(async (req, res) => {
  const ctx = getContext(req);
  const links = await PortalLink.findAll({
    where: { customerId: ctx.customerId },
    order: [['createdAt', 'DESC']],
  });

  return res.json({
    success: true,
    data: links,
  });
});

/**
 * Get Workspace Activities Feed
 */
const getWorkspaceActivities = asyncHandler(async (req, res) => {
  const ctx = getContext(req);
  const activities = await PortalActivity.findAll({
    where: { customerId: ctx.customerId },
    order: [['createdAt', 'DESC']],
    limit: 100,
  });

  return res.json({
    success: true,
    data: activities,
  });
});

/**
 * Global Search across files, folders, messages, links, quotations, invoices
 */
const globalSearch = asyncHandler(async (req, res) => {
  const ctx = getContext(req);
  const query = (req.query.q || '').trim();

  if (!query) {
    return res.json({
      success: true,
      data: { files: [], folders: [], posts: [], links: [], quotations: [], invoices: [] },
    });
  }

  const fileMatches = await PortalFile.findAll({
    where: {
      customerId: ctx.customerId,
      originalFileName: { [Op.iLike]: `%${query}%` },
    },
    limit: 10,
  });

  const folderMatches = await PortalFolder.findAll({
    where: {
      customerId: ctx.customerId,
      name: { [Op.iLike]: `%${query}%` },
    },
    limit: 10,
  });

  const postMatches = await PortalTextPost.findAll({
    where: {
      customerId: ctx.customerId,
      [Op.or]: [
        { title: { [Op.iLike]: `%${query}%` } },
        { message: { [Op.iLike]: `%${query}%` } },
      ],
    },
    limit: 10,
  });

  const linkMatches = await PortalLink.findAll({
    where: {
      customerId: ctx.customerId,
      [Op.or]: [
        { title: { [Op.iLike]: `%${query}%` } },
        { url: { [Op.iLike]: `%${query}%` } },
      ],
    },
    limit: 10,
  });

  const quotationMatches = await Quotation.findAll({
    where: {
      customerId: ctx.customerId,
      [Op.or]: [
        { quotationNumber: { [Op.iLike]: `%${query}%` } },
        { projectName: { [Op.iLike]: `%${query}%` } },
      ],
    },
    limit: 10,
  });

  const invoiceMatches = await Invoice.findAll({
    where: {
      customerId: ctx.customerId,
      invoiceNumber: { [Op.iLike]: `%${query}%` },
    },
    limit: 10,
  });

  return res.json({
    success: true,
    data: {
      files: fileMatches,
      folders: folderMatches,
      posts: postMatches,
      links: linkMatches,
      quotations: quotationMatches,
      invoices: invoiceMatches,
    },
  });
});

/**
 * Direct Proxy Upload (Fallback for S3 connection issues)
 */
const directProxyUpload = asyncHandler(async (req, res) => {
  const ctx = getContext(req);
  if (!req.file) {
    throw new AppError('No file provided', 400);
  }

  const file = req.file;
  const folderId = req.body.folderId || null;

  const timestamp = Date.now();
  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const objectKey = `clients/${ctx.customerId}/${timestamp}_${safeName}`;

  await uploadBufferToWasabi(file.buffer, objectKey, file.mimetype || 'application/octet-stream');

  const extension = file.originalname.split('.').pop()?.toLowerCase() || '';
  const endpoint = process.env.S3_ENDPOINT || 'https://s3.ap-southeast-2.wasabisys.com';
  const bucketName = process.env.S3_BUCKET_NAME || 'crm-development';
  const wasabiUrl = `${endpoint}/${bucketName}/${objectKey}`;

  const fileRecord = await PortalFile.create({
    customerId: ctx.customerId,
    tenantId: ctx.tenantId,
    folderId: folderId || null,
    originalFileName: file.originalname,
    storageFileName: objectKey.split('/').pop(),
    fileSize: file.size,
    extension,
    mimeType: file.mimetype,
    uploadedByRole: ctx.role,
    uploadedById: ctx.actorId,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    wasabiObjectKey: objectKey,
    wasabiUrl,
    currentVersion: 1,
    virusScanResult: 'clean',
  });

  await PortalActivity.create({
    customerId: ctx.customerId,
    tenantId: ctx.tenantId,
    actorRole: ctx.role,
    actorName: ctx.actorName,
    actorId: ctx.actorId,
    actionType: 'FILE_UPLOADED',
    description: `Uploaded file "${file.originalname}" (${(file.size / 1024 / 1024).toFixed(2)} MB)`,
    metadata: { fileId: fileRecord.id, fileName: file.originalname, objectKey },
  });

  return res.json({
    success: true,
    data: fileRecord,
  });
});

/**
 * Get comments for a specific document
 */
const getFileComments = asyncHandler(async (req, res) => {
  const ctx = getContext(req);
  const { fileId } = req.params;

  const comments = await PortalDocumentComment.findAll({
    where: { fileId, customerId: ctx.customerId },
    order: [['createdAt', 'DESC']],
  });

  return res.json({
    success: true,
    data: comments,
  });
});

/**
 * Add a comment or note to a document
 */
const createFileComment = asyncHandler(async (req, res) => {
  const ctx = getContext(req);
  const { fileId } = req.params;
  const { content, noteType } = req.body;

  if (!content || !content.trim()) {
    throw new AppError('Comment content is required', 400);
  }

  const comment = await PortalDocumentComment.create({
    fileId,
    customerId: ctx.customerId,
    tenantId: ctx.tenantId,
    authorRole: ctx.role || 'client',
    authorName: ctx.actorName || (ctx.role === 'admin' ? 'Admin' : 'Client'),
    authorId: ctx.actorId,
    noteType: noteType || (ctx.role === 'admin' ? 'internal_note' : 'client_note'),
    content: content.trim(),
  });

  await PortalActivity.create({
    customerId: ctx.customerId,
    tenantId: ctx.tenantId,
    actorRole: ctx.role,
    actorName: ctx.actorName,
    actorId: ctx.actorId,
    actionType: 'comment_added',
    description: `Added a note/comment on document`,
    metadata: { fileId, commentId: comment.id },
  });

  return res.status(201).json({
    success: true,
    data: comment,
  });
});

/**
 * Delete a comment or note
 */
const deleteFileComment = asyncHandler(async (req, res) => {
  const ctx = getContext(req);
  const { fileId, commentId } = req.params;

  const comment = await PortalDocumentComment.findOne({
    where: { id: commentId, fileId, customerId: ctx.customerId },
  });

  if (!comment) {
    throw new AppError('Comment not found', 404);
  }

  await comment.destroy();

  return res.json({
    success: true,
    data: { id: commentId },
  });
});

module.exports = {
  requestPresignedUpload,
  completeFileUpload,
  directProxyUpload,
  getSignedDownload,
  getWorkspaceFiles,
  getWorkspaceFolders,
  createClientFolder,
  requestItemDeletion,
  createTextPost,
  getTextPosts,
  createLink,
  getLinks,
  getWorkspaceActivities,
  globalSearch,
  getFileComments,
  createFileComment,
  deleteFileComment,
};
