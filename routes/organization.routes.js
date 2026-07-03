import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { getOrganization, updateOrganization } from '../controllers/organization.controller.js';

const router = Router();

router.use(authenticate);

router.route('/')
  .get(getOrganization)
  .put(updateOrganization);

export default router;
