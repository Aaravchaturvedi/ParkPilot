const { Router } = require('express');
const { ah } = require('../middleware/async');
const c = require('../controllers/spaces');

const router = Router();
router.get('/nearby', ah(c.nearby)); // public: browsing prices needs no login

module.exports = router;
