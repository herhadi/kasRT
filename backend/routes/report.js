import express from 'express';
import { auth } from '../middleware/auth.js';
import { dashboardWarga, laporanBulanan } from '../controllers/reportController.js';
import { asyncHandler } from '../middleware/auth.js';

const router = express.Router();

router.get(
    '/dashboard',
    auth,
    asyncHandler(dashboardWarga)
);

router.get(
  '/laporan-bulanan',
  auth,
  asyncHandler(laporanBulanan)
);

export default router;
