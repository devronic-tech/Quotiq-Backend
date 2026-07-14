const { Router } = require('express');
const { authenticate } = require('../middleware/auth.middleware.js');
const { listOffers, getOffer, createOffer, updateOffer, deleteOffer, } = require('../controllers/offer-letter.controller.js');

const router = Router();

router.use(authenticate);

router.route('/')
  .get(listOffers)
  .post(createOffer);

router.route('/:id')
  .get(getOffer)
  .put(updateOffer)
  .delete(deleteOffer);

module.exports = router;
