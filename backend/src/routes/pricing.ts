import { Router } from 'express';
import { ah } from '../middleware/async';
import * as c from '../controllers/pricing';

const router = Router();
router.get('/quote', ah(c.quote));

export default router;
