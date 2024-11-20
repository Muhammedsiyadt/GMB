const AuthController = require("../controllers/AuthControllers");
const AuthMiddleware = require('../middleware/AuthMiddleware');
const router = require("express").Router();


router.post('/login', AuthController.login);
router.post('/verify-token', AuthController.tokenVerify);
router.get('/user-details', AuthMiddleware, AuthController.me);
router.get('/connected-accounts', AuthMiddleware, AuthController.GMBAccount);
router.post('/refresh-token', AuthMiddleware, AuthController.newAccessTokenGMB);

module.exports = router;