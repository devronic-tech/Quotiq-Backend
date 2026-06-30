import { Router } from 'express';
import { departmentSchema } from '../schemas/department.schema.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import * as departmentController from '../controllers/department.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', departmentController.listDepartments);
router.post('/', validate({ body: departmentSchema }), departmentController.createDepartment);
router.put('/:id', validate({ body: departmentSchema }), departmentController.updateDepartment);
router.delete('/:id', departmentController.deleteDepartment);

export default router;
