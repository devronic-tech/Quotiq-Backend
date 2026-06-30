import { Router } from 'express';
import { productSchema, serviceSchema } from '../schemas/product.schema.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import * as productController from '../controllers/product.controller.js';
import * as serviceController from '../controllers/service.controller.js';

const router = Router();

router.use(authenticate);

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

export default router;
