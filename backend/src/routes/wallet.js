const { Router } = require('express');
const requireAuth = require('../middleware/requireAuth');
const { ah } = require('../middleware/async');
const c = require('../controllers/wallet');

const router = Router();
router.get('/', requireAuth, ah(c.get));

module.exports = router;
