const { Router } = require('express');
const requireAuth = require('../middleware/requireAuth');
const { ah } = require('../middleware/async');
const c = require('../controllers/vehicles');

const router = Router();
router.use(requireAuth);
router.post('/', ah(c.create));
router.get('/mine', ah(c.mine));
router.patch('/:id', ah(c.update));

module.exports = router;
