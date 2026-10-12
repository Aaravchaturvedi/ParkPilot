const { Router } = require('express');
const { ah } = require('../middleware/async');
const c = require('../controllers/pricing');

const router = Router();
router.get('/quote', ah(c.quote));

module.exports = router;
