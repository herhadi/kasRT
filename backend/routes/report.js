import express from 'express';
import { auth } from '../middleware/auth.js';
import { allowRoles } from '../middleware/role.js';
import {
  dashboardAdminInternet,
  dashboardAdminJimpitan,
  dashboardAdminKoperasi,
  dashboardAdminLingkungan,
  dashboardAdminSosial,
  dashboardAdminBendahara,
  dashboardAdminPembangunan,
  rekapKeuanganBulanan,
  dashboardWarga,
  myContributionDetail,
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
  '/my-contribution-detail',
  auth,
  asyncHandler(myContributionDetail)
);

router.get(
  '/dashboard-admin-jimpitan',
  auth,
  allowRoles('Admin Jimpitan', 'Ketua'),
  asyncHandler(dashboardAdminJimpitan)
);

router.get(
  '/dashboard-admin-pembangunan',
  auth,
  allowRoles('Admin Pembangunan', 'Ketua'),
  asyncHandler(dashboardAdminPembangunan)
);

router.get(
  '/dashboard-admin-internet',
  auth,
  allowRoles('Admin Internet', 'Ketua'),
  asyncHandler(dashboardAdminInternet)
);

router.get(
  '/dashboard-admin-koperasi',
  auth,
  allowRoles('Admin Koperasi', 'Ketua'),
  asyncHandler(dashboardAdminKoperasi)
);

router.get(
  '/dashboard-admin-bendahara',
  auth,
  allowRoles('Bendahara', 'Ketua'),
  asyncHandler(dashboardAdminBendahara)
);

router.get(
  '/dashboard-admin-lingkungan',
  auth,
  allowRoles('Admin Lingkungan', 'Ketua'),
  asyncHandler(dashboardAdminLingkungan)
);

router.get(
  '/dashboard-admin-sosial',
  auth,
  allowRoles('Admin Sosial', 'Ketua'),
  asyncHandler(dashboardAdminSosial)
);

router.get(
  '/rekap-keuangan',
  auth,
  allowRoles('Ketua', 'Sekretaris'),
  asyncHandler(rekapKeuanganBulanan)
);

export default router;
