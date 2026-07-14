const { Router } = require('express');
const { authenticate } = require('../middleware/auth.middleware.js');
const { getOrganization, updateOrganization } = require('../controllers/organization.controller.js');

const router = Router();

router.use(authenticate);

router.route('/')
  .get(getOrganization)
  .put(updateOrganization);

module.exports = router;
