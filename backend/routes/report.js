import express from 'express';
import { auth } from '../middleware/auth.js';
import { allowRoles } from '../middleware/role.js';
import { dashboardAdminJimpitan, dashboardWarga, laporanBulanan } from '../controllers/reportController.js';
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

router.get(
  '/dashboard-admin-jimpitan',
  auth,
  allowRoles('Admin Jimpitan', 'root'),
  asyncHandler(dashboardAdminJimpitan)
);

export default router;
