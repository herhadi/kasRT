import express from 'express';
import { auth } from '../middleware/auth.js';
import { allowRoles } from '../middleware/role.js';
import {
  dashboardAdminInternet,
  dashboardAdminJimpitan,
  dashboardAdminKoperasi,
  dashboardAdminPembangunan,
  dashboardWarga,
  laporanBulanan
} from '../controllers/reportController.js';
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

router.get(
  '/dashboard-admin-pembangunan',
  auth,
  allowRoles('Admin Pembangunan', 'root'),
  asyncHandler(dashboardAdminPembangunan)
);

router.get(
  '/dashboard-admin-internet',
  auth,
  allowRoles('Admin Internet', 'root'),
  asyncHandler(dashboardAdminInternet)
);

router.get(
  '/dashboard-admin-koperasi',
  auth,
  allowRoles('Admin Koperasi', 'root'),
  asyncHandler(dashboardAdminKoperasi)
);

export default router;
