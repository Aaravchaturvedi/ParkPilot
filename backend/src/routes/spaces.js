const { Router } = require('express');
const requireAuth = require('../middleware/requireAuth');
const { ah } = require('../middleware/async');
const c = require('../controllers/spaces');

const router = Router();
router.get('/nearby', ah(c.nearby)); // public
router.post('/', requireAuth, ah(c.create));
router.get('/mine', requireAuth, ah(c.mine));
router.patch('/:id', requireAuth, ah(c.update));

module.exports = router;
