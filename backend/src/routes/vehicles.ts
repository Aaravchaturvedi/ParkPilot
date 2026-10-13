import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { ah } from '../middleware/async';
import * as c from '../controllers/vehicles';

const router = Router();
router.use(requireAuth);
router.post('/', ah(c.create));
router.get('/mine', ah(c.mine));
router.patch('/:id', ah(c.update));

export default router;
