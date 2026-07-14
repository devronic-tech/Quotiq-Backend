const { Router } = require('express');
const { customerSchema } = require('../schemas/customer.schema.js');
const { validate } = require('../middleware/validate.middleware.js');
const { authenticate } = require('../middleware/auth.middleware.js');
const customerController = require('../controllers/customer.controller.js');

const router = Router();

router.use(authenticate);

router.get('/', customerController.listCustomers);
router.get('/:id', customerController.getCustomer);
router.post('/', validate({ body: customerSchema }), customerController.createCustomer);
router.put('/:id', validate({ body: customerSchema }), customerController.updateCustomer);
router.delete('/:id', customerController.deleteCustomer);

module.exports = router;
