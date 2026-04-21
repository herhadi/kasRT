import express from 'express';

import { login, me } from '../controllers/authController.js';
import { generateTelegramActivationLink } from '../controllers/telegramController.js';
import { auth, asyncHandler, validateRequiredFields } from '../middleware/auth.js';

const router = express.Router();

router.post(
  '/login',
  validateRequiredFields(['no_hp', 'pin']),
  asyncHandler(login)
);

router.get('/me', auth, asyncHandler(me));

router.post('/telegram-activation-link', auth, asyncHandler(generateTelegramActivationLink));

export default router;
