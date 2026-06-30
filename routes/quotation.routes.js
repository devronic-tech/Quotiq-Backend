import { Router } from 'express';
import { createQuotationSchema } from '../schemas/quotation.schema.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import * as quotationController from '../controllers/quotation.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', quotationController.listQuotations);
router.get('/:id', quotationController.getQuotation);
router.post('/', validate({ body: createQuotationSchema }), quotationController.createQuotation);
router.patch('/:id/status', quotationController.patchQuotationStatus);
router.put('/:id', validate({ body: createQuotationSchema }), quotationController.updateQuotation);
router.delete('/:id', quotationController.deleteQuotation);

export default router;
