import express from 'express';

import { changeMyPin, getWargaOptions, login, me, updateMyProfile } from '../controllers/authController.js';
import { generateTelegramActivationLink } from '../controllers/telegramController.js';
import { auth, asyncHandler, validateRequiredFields } from '../middleware/auth.js';

const router = express.Router();

router.post(
  '/login',
  validateRequiredFields(['no_hp', 'pin']),
  asyncHandler(login)
);

router.get('/me', auth, asyncHandler(me));
router.get('/warga-options', auth, asyncHandler(getWargaOptions));
router.post('/change-pin', auth, asyncHandler(changeMyPin));
router.post('/profile', auth, asyncHandler(updateMyProfile));

router.post('/telegram-activation-link', auth, asyncHandler(generateTelegramActivationLink));

export default router;
