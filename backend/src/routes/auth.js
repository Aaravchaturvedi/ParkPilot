const { Router } = require('express');
const requireAuth = require('../middleware/requireAuth');
const auth = require('../controllers/auth');

const router = Router();
const ah = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.post('/register', ah(auth.register));
router.post('/login', ah(auth.login));
router.post('/refresh', ah(auth.refresh));
router.get('/me', requireAuth, ah(auth.me));

module.exports = router;
