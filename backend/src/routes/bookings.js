const { Router } = require('express');
const requireAuth = require('../middleware/requireAuth');
const { ah } = require('../middleware/async');
const c = require('../controllers/bookings');

const router = Router();
router.use(requireAuth);

router.post('/', ah(c.create));
router.get('/', ah(c.list));
router.get('/:id', ah(c.get));
router.patch('/:id/accept', ah(c.accept));
router.patch('/:id/cancel', ah(c.cancel));
router.patch('/:id/complete', ah(c.complete));

module.exports = router;
