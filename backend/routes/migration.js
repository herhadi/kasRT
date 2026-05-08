import express from 'express';
import { auth, asyncHandler } from '../middleware/auth.js';
import { allowRoles } from '../middleware/role.js';
import {
  applyMigration2025Opening2026,
  getMigration2025InternetSummary,
  getMigration2025IuranSummary,
  getMigration2025JimpitanSummary,
  getMigration2025KoperasiIuranSummary,
  getMigration2025KoperasiLoansSummary,
  getMigration2025LingkunganSummary,
  getMigration2025SosialSummary,
  getMigration2025TabunganSummary,
  saveMigration2025Internet,
  saveMigration2025Iuran,
  saveMigration2025Jimpitan,
  saveMigration2025KoperasiIuran,
  saveMigration2025KoperasiLoans,
  saveMigration2025Lingkungan,
  saveMigration2025Sosial,
  saveMigration2025Tabungan
} from '../controllers/migrationController.js';

const router = express.Router();

router.use(auth, allowRoles('root'));
router.get('/iuran-2025/summary', asyncHandler(getMigration2025IuranSummary));
router.post('/iuran-2025', asyncHandler(saveMigration2025Iuran));
router.post('/iuran-2025/apply-opening-2026', asyncHandler(applyMigration2025Opening2026));
router.get('/internet-2025/summary', asyncHandler(getMigration2025InternetSummary));
router.post('/internet-2025', asyncHandler(saveMigration2025Internet));
router.get('/lingkungan-2025/summary', asyncHandler(getMigration2025LingkunganSummary));
router.post('/lingkungan-2025', asyncHandler(saveMigration2025Lingkungan));
router.get('/jimpitan-2025/summary', asyncHandler(getMigration2025JimpitanSummary));
router.post('/jimpitan-2025', asyncHandler(saveMigration2025Jimpitan));
router.get('/tabungan-2025/summary', asyncHandler(getMigration2025TabunganSummary));
router.post('/tabungan-2025', asyncHandler(saveMigration2025Tabungan));
router.get('/sosial-2025/summary', asyncHandler(getMigration2025SosialSummary));
router.post('/sosial-2025', asyncHandler(saveMigration2025Sosial));
router.get('/koperasi-iuran-2025/summary', asyncHandler(getMigration2025KoperasiIuranSummary));
router.post('/koperasi-iuran-2025', asyncHandler(saveMigration2025KoperasiIuran));
router.get('/koperasi-loans-2025/summary', asyncHandler(getMigration2025KoperasiLoansSummary));
router.post('/koperasi-loans-2025', asyncHandler(saveMigration2025KoperasiLoans));

export default router;
