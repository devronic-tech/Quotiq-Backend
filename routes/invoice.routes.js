import { Router } from 'express';
import { invoiceSchema, recordPaymentSchema } from '../schemas/invoice.schema.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import * as invoiceController from '../controllers/invoice.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', invoiceController.listInvoices);
router.get('/:id', invoiceController.getInvoice);
router.post('/', validate({ body: invoiceSchema }), invoiceController.createInvoice);
router.patch('/:id/status', invoiceController.patchInvoiceStatus);
router.post('/:id/payments', validate({ body: recordPaymentSchema }), invoiceController.recordPayment);
router.delete('/:id', invoiceController.deleteInvoice);

export default router;
