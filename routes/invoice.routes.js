const { Router } = require('express');
const { invoiceSchema, recordPaymentSchema } = require('../schemas/invoice.schema.js');
const { validate } = require('../middleware/validate.middleware.js');
const { authenticate } = require('../middleware/auth.middleware.js');
const invoiceController = require('../controllers/invoice.controller.js');

const router = Router();

router.use(authenticate);

router.get('/', invoiceController.listInvoices);
router.get('/:id', invoiceController.getInvoice);
router.post('/', validate({ body: invoiceSchema }), invoiceController.createInvoice);
router.patch('/:id/status', invoiceController.patchInvoiceStatus);
router.post('/:id/payments', validate({ body: recordPaymentSchema }), invoiceController.recordPayment);
router.delete('/:id', invoiceController.deleteInvoice);

module.exports = router;
