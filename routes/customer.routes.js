import { Router } from 'express';
import { customerSchema } from '../schemas/customer.schema.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import * as customerController from '../controllers/customer.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', customerController.listCustomers);
router.get('/:id', customerController.getCustomer);
router.post('/', validate({ body: customerSchema }), customerController.createCustomer);
router.put('/:id', validate({ body: customerSchema }), customerController.updateCustomer);
router.delete('/:id', customerController.deleteCustomer);

export default router;
