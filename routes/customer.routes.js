const { Router } = require('express');
const { customerSchema } = require('../schemas/customer.schema.js');
const { validate } = require('../middleware/validate.middleware.js');
const { authenticate } = require('../middleware/auth.middleware.js');
const customerController = require('../controllers/customer.controller.js');
const portalAdminController = require('../controllers/portal-admin.controller.js');
const portalWorkspaceController = require('../controllers/portal-workspace.controller.js');

const router = Router();

router.use(authenticate);

router.get('/', customerController.listCustomers);
router.get('/:id', customerController.getCustomer);
router.post('/', validate({ body: customerSchema }), customerController.createCustomer);
router.put('/:id', validate({ body: customerSchema }), customerController.updateCustomer);
router.delete('/:id', customerController.deleteCustomer);

// ── Customer Portal Admin Settings ───────────────────────────
router.get('/:id/portal', portalAdminController.getPortalAccount);
router.put('/:id/portal', portalAdminController.updatePortalAccount);
router.post('/:id/portal/code/regenerate', portalAdminController.regenerateClientCode);
router.post('/:id/portal/password/reset', portalAdminController.resetClientPassword);
router.get('/:id/portal/folders', portalAdminController.getFolderVisibilityList);
router.post('/:id/portal/folders', portalAdminController.createAdminFolder);
router.put('/:id/portal/folders/:folderId', portalAdminController.updateFolderVisibility);
router.post('/:id/portal/deletion-request/resolve', portalAdminController.resolveDeletionRequest);

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

// ── Admin Workspace Operations for Customer ──────────────────
router.post('/:customerId/portal/upload-url', portalWorkspaceController.requestPresignedUpload);
router.post('/:customerId/portal/files/complete', portalWorkspaceController.completeFileUpload);
router.post('/:customerId/portal/files/upload-direct', upload.single('file'), portalWorkspaceController.directProxyUpload);
router.get('/:customerId/portal/files/:fileId/download', portalWorkspaceController.getSignedDownload);
router.get('/:customerId/portal/files', portalWorkspaceController.getWorkspaceFiles);
router.get('/:customerId/portal/activities', portalWorkspaceController.getWorkspaceActivities);
router.get('/:customerId/portal/text-posts', portalWorkspaceController.getTextPosts);
router.post('/:customerId/portal/text-posts', portalWorkspaceController.createTextPost);
router.get('/:customerId/portal/links', portalWorkspaceController.getLinks);
router.post('/:customerId/portal/links', portalWorkspaceController.createLink);

// Document Comments & Discussions (Admin API)
router.get('/:customerId/portal/files/:fileId/comments', portalWorkspaceController.getFileComments);
router.post('/:customerId/portal/files/:fileId/comments', portalWorkspaceController.createFileComment);
router.delete('/:customerId/portal/files/:fileId/comments/:commentId', portalWorkspaceController.deleteFileComment);

module.exports = router;

