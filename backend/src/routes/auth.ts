import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { ah } from '../middleware/async';
import * as auth from '../controllers/auth';

const router = Router();

router.post('/register', ah(auth.register));
router.post('/login', ah(auth.login));
router.post('/refresh', ah(auth.refresh));
router.get('/me', requireAuth, ah(auth.me));
router.patch('/kyc', requireAuth, ah(auth.submitKyc));

export default router;
