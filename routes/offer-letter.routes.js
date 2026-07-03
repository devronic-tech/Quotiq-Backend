import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listOffers,
  getOffer,
  createOffer,
  updateOffer,
  deleteOffer,
} from '../controllers/offer-letter.controller.js';

const router = Router();

router.use(authenticate);

router.route('/')
  .get(listOffers)
  .post(createOffer);

router.route('/:id')
  .get(getOffer)
  .put(updateOffer)
  .delete(deleteOffer);

export default router;
