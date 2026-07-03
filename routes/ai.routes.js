import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware.js';
import * as aiController from '../controllers/ai.controller.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

router.use(authenticate);

router.post('/generate-quotation', upload.any(), aiController.generateQuotation);
router.post('/transcribe', upload.any(), aiController.transcribeOnly);
router.post('/enhance-text', aiController.enhanceText);

export default router;
