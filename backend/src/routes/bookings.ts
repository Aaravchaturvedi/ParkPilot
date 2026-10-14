import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { ah } from '../middleware/async';
import * as c from '../controllers/bookings';

const router = Router();
router.use(requireAuth);

router.post('/', ah(c.create));
router.get('/', ah(c.list));
router.get('/:id', ah(c.get));
router.patch('/:id/accept', ah(c.accept));
router.post('/:id/start-otp', ah(c.requestStartOtp));
router.post('/:id/start-verify', ah(c.verifyStartOtp));
router.post('/:id/stop-otp', ah(c.requestStopOtp));
router.post('/:id/stop-verify', ah(c.verifyStopOtp));
router.patch('/:id/cancel', ah(c.cancel));
router.patch('/:id/complete', ah(c.complete));
router.patch('/:id/pay', ah(c.pay)); // mock payment (customer)

export default router;
