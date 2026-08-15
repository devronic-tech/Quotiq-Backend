const { Router } = require('express');
const { productSchema, serviceSchema } = require('../schemas/product.schema.js');
const { validate } = require('../middleware/validate.middleware.js');
const { authenticate } = require('../middleware/auth.middleware.js');
const productController = require('../controllers/product.controller.js');
const serviceController = require('../controllers/service.controller.js');

const router = Router();

router.use(['/products', '/services'], authenticate);

// Products CRUD
router.get('/products', productController.listProducts);
router.get('/products/:id', productController.getProduct);
router.post('/products', validate({ body: productSchema }), productController.createProduct);
router.put('/products/:id', validate({ body: productSchema }), productController.updateProduct);
router.delete('/products/:id', productController.deleteProduct);

// Services CRUD
router.get('/services', serviceController.listServices);
router.get('/services/:id', serviceController.getService);
router.post('/services', validate({ body: serviceSchema }), serviceController.createService);
router.put('/services/:id', validate({ body: serviceSchema }), serviceController.updateService);
router.delete('/services/:id', serviceController.deleteService);

module.exports = router;
