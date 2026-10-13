import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { ah } from '../middleware/async';
import * as c from '../controllers/wallet';

const router = Router();
router.get('/', requireAuth, ah(c.get));

export default router;
