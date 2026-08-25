const express = require('express');
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Rate limiting on authentication routes
router.use(authLimiter);

router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/demo-session', authController.demoSession);
router.get('/demo-session', authController.demoSession);
router.get('/me', requireAuth, authController.getMe);

module.exports = router;
