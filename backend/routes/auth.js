import express from 'express';

import { changeMyPin, confirmPinResetFromWhatsApp, getWargaOptions, login, me, requestPinReset, updateMyProfile } from '../controllers/authController.js';
import { disconnectMyTelegram, generateTelegramActivationLink } from '../controllers/telegramController.js';
import { auth, asyncHandler, validateRequiredFields } from '../middleware/auth.js';

const router = express.Router();

router.post(
  '/login',
  validateRequiredFields(['no_hp', 'pin']),
  asyncHandler(login)
);
router.post('/request-pin-reset', asyncHandler(requestPinReset));
router.post('/wa-pin-reset-confirmation', (req, res, next) => {
  const configured = String(process.env.WA_GATEWAY_SECRET || process.env.WA_LAB_SECRET || '').trim();
  if (configured && req.headers['x-wa-gateway-secret'] !== configured) return res.status(403).json({ success: false, message: 'Forbidden' });
  return next();
}, asyncHandler(confirmPinResetFromWhatsApp));

router.get('/me', auth, asyncHandler(me));
router.get('/warga-options', auth, asyncHandler(getWargaOptions));
router.post('/change-pin', auth, asyncHandler(changeMyPin));
router.post('/profile', auth, asyncHandler(updateMyProfile));

router.post('/telegram-activation-link', auth, asyncHandler(generateTelegramActivationLink));
router.post('/telegram-disconnect', auth, asyncHandler(disconnectMyTelegram));

export default router;
