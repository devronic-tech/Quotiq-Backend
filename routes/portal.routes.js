const express = require('express');
const router = express.Router();
const { clientLogin, activateAccount, getClientProfile } = require('../controllers/portal-auth.controller.js');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

const {
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
} = require('../controllers/portal-workspace.controller.js');
const { requireClientAuth } = require('../middleware/portal-auth.middleware.js');

// ── Public Authentication ─────────────────────────────────────
router.post('/auth/login', clientLogin);
router.post('/auth/activate', activateAccount);

// ── Protected Client Routes ──────────────────────────────────
router.use(requireClientAuth);

router.get('/auth/me', getClientProfile);
router.post('/upload-url', requestPresignedUpload);
router.post('/files/complete', completeFileUpload);
router.post('/files/upload-direct', upload.single('file'), directProxyUpload);
router.get('/files/:fileId/download', getSignedDownload);
router.get('/files', getWorkspaceFiles);
router.get('/folders', getWorkspaceFolders);
router.post('/folders', createClientFolder);
router.post('/deletion-request', requestItemDeletion);
router.post('/text-posts', createTextPost);
router.get('/text-posts', getTextPosts);
router.post('/links', createLink);
router.get('/links', getLinks);
router.get('/activities', getWorkspaceActivities);
router.get('/search', globalSearch);

// Document Comments & Discussions (Client Portal API)
router.get('/files/:fileId/comments', getFileComments);
router.post('/files/:fileId/comments', createFileComment);
router.delete('/files/:fileId/comments/:commentId', deleteFileComment);

module.exports = router;
