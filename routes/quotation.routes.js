const { Router } = require('express');
const { createQuotationSchema } = require('../schemas/quotation.schema.js');
const { validate } = require('../middleware/validate.middleware.js');
const { authenticate } = require('../middleware/auth.middleware.js');
const quotationController = require('../controllers/quotation.controller.js');

const router = Router();

router.use(authenticate);

router.get('/', quotationController.listQuotations);
router.get('/:id', quotationController.getQuotation);
router.post('/', validate({ body: createQuotationSchema }), quotationController.createQuotation);
router.patch('/:id/status', quotationController.patchQuotationStatus);
router.put('/:id', validate({ body: createQuotationSchema }), quotationController.updateQuotation);
router.delete('/:id', quotationController.deleteQuotation);

module.exports = router;
