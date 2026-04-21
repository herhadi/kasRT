import express from 'express';

import { login } from '../controllers/authController.js';
import { asyncHandler, validateRequiredFields } from '../middleware/auth.js';

const router = express.Router();

router.post(
  '/login',
  validateRequiredFields(['no_hp', 'pin']),
  asyncHandler(login)
);

export default router;
