import express from 'express';
import { asyncHandler } from '../middleware/auth.js';
import { telegramWebhook } from '../controllers/telegramController.js';

const router = express.Router();

router.post('/webhook', asyncHandler(telegramWebhook));

export default router;
