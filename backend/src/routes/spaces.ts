import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { ah } from '../middleware/async';
import * as c from '../controllers/spaces';

const router = Router();
router.get('/nearby', ah(c.nearby)); // public
router.post('/', requireAuth, ah(c.create));
router.get('/mine', requireAuth, ah(c.mine));
router.patch('/:id', requireAuth, ah(c.update));
router.delete('/:id', requireAuth, ah(c.destroy));

export default router;
