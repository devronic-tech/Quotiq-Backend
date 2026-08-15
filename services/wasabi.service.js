const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { env } = require('../config/env.js');
const { logger } = require('../utils/logger.js');

const endpoint = process.env.S3_ENDPOINT || env.S3_ENDPOINT || 'https://s3.ap-southeast-2.wasabisys.com';
const region = process.env.S3_REGION || env.S3_REGION || 'ap-southeast-2';
const bucketName = process.env.S3_BUCKET_NAME || env.S3_BUCKET || 'crm-development';
const accessKeyId = process.env.S3_ACCESS_KEY || env.S3_ACCESS_KEY || '';
const secretAccessKey = process.env.S3_SECRET_KEY || env.S3_SECRET_KEY || '';

const s3Client = new S3Client({
  endpoint,
  region,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
  forcePathStyle: true, // required for Wasabi compatibility
});

/**
 * Generate a pre-signed URL for direct client upload to Wasabi
 */
async function getSignedUploadUrl(objectKey, contentType = 'application/octet-stream', expiresIn = 3600) {
  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });
    const fileUrl = `${endpoint}/${bucketName}/${objectKey}`;
    return { uploadUrl, objectKey, fileUrl };
  } catch (error) {
    logger.error({ error, objectKey }, 'Error generating signed upload URL');
    throw error;
  }
}

/**
 * Generate a pre-signed URL for secure download from Wasabi (with local file fallback)
 */
async function getSignedDownloadUrl(objectKey, fileName, expiresIn = 3600) {
  const localFilePath = path.join(__dirname, '../uploads', objectKey);
  if (fs.existsSync(localFilePath)) {
    return { isLocal: true, localFilePath };
  }

  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      ResponseContentDisposition: fileName ? `attachment; filename="${encodeURIComponent(fileName)}"` : undefined,
    });
    const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn });
    return { isLocal: false, downloadUrl };
  } catch (error) {
    logger.warn({ error: error.message, objectKey }, 'Wasabi S3 signed download failed; checking local storage.');
    if (fs.existsSync(localFilePath)) {
      return { isLocal: true, localFilePath };
    }
    throw error;
  }
}

/**
 * Delete object physically from Wasabi or local disk
 */
async function deleteObjectFromWasabi(objectKey) {
  const localFilePath = path.join(__dirname, '../uploads', objectKey);
  if (fs.existsSync(localFilePath)) {
    try {
      await fs.promises.unlink(localFilePath);
    } catch (e) {}
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    });
    await s3Client.send(command);
    logger.info({ objectKey }, 'Object deleted from Wasabi');
    return true;
  } catch (error) {
    logger.error({ error, objectKey }, 'Error deleting object from Wasabi');
    return true;
  }
}

/**
 * Server-side direct buffer upload to Wasabi (with automatic local disk fallback)
 */
async function uploadBufferToWasabi(buffer, objectKey, contentType = 'application/octet-stream') {
  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      Body: buffer,
      ContentType: contentType,
    });
    await s3Client.send(command);
    const fileUrl = `${endpoint}/${bucketName}/${objectKey}`;
    return { objectKey, fileUrl, isLocal: false };
  } catch (error) {
    logger.warn({ error: error.message, objectKey }, 'Wasabi S3 upload failed; saving to local disk fallback.');
    
    // Save to local disk fallback directory
    const uploadsDir = path.join(__dirname, '../uploads', path.dirname(objectKey));
    await fs.promises.mkdir(uploadsDir, { recursive: true });
    const localFilePath = path.join(__dirname, '../uploads', objectKey);
    await fs.promises.writeFile(localFilePath, buffer);

    return { objectKey, fileUrl: `/uploads/${objectKey}`, isLocal: true };
  }
}

/**
 * Stream file directly from Wasabi S3 or local disk
 */
async function getFileStreamFromWasabi(objectKey) {
  const localFilePath = path.join(__dirname, '../uploads', objectKey);
  if (fs.existsSync(localFilePath)) {
    return { isLocal: true, localFilePath };
  }

  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    });
    const s3Response = await s3Client.send(command);
    return {
      isLocal: false,
      stream: s3Response.Body,
      contentType: s3Response.ContentType,
      contentLength: s3Response.ContentLength,
    };
  } catch (error) {
    logger.warn({ error: error.message, objectKey }, 'S3 GetObject failed; checking local storage fallback.');
    if (fs.existsSync(localFilePath)) {
      return { isLocal: true, localFilePath };
    }
    throw error;
  }
}

module.exports = {
  s3Client,
  bucketName,
  getSignedUploadUrl,
  getSignedDownloadUrl,
  deleteObjectFromWasabi,
  uploadBufferToWasabi,
  getFileStreamFromWasabi,
};
