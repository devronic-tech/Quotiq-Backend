const { Router } = require('express');
const { departmentSchema } = require('../schemas/department.schema.js');
const { validate } = require('../middleware/validate.middleware.js');
const { authenticate } = require('../middleware/auth.middleware.js');
const departmentController = require('../controllers/department.controller.js');

const router = Router();

router.use(authenticate);

router.get('/', departmentController.listDepartments);
router.post('/', validate({ body: departmentSchema }), departmentController.createDepartment);
router.put('/:id', validate({ body: departmentSchema }), departmentController.updateDepartment);
router.delete('/:id', departmentController.deleteDepartment);

module.exports = router;
