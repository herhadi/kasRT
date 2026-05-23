import express from 'express';
import { auth, asyncHandler } from '../middleware/auth.js';
import { allowRoles } from '../middleware/role.js';
import {
  applyMigration2025Opening2026,
  getMigration2025InternetSummary,
  getMigration2025InternetTariffs,
  getMigration2025InternetWargaDetail,
  getMigration2025IuranSummary,
  getMigration2025IuranTariffs,
  getMigration2025IuranWargaDetail,
  getMigration2025JimpitanSummary,
  getMigration2025JimpitanTariffs,
  getMigration2025JimpitanWargaDetail,
  getMigration2025KoperasiIuranSummary,
  getMigration2025KoperasiIuranWargaDetail,
  getMigration2025KoperasiLoansSummary,
  getMigration2025LingkunganSummary,
  getMigration2025LingkunganTariffs,
  getMigration2025LingkunganWargaDetail,
  getMigration2025SosialDetail,
  getMigration2025SosialSummary,
  getMigration2025TabunganSummary,
  getMigration2025TabunganWargaDetail,
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
router.get('/iuran-2025/tariffs', asyncHandler(getMigration2025IuranTariffs));
router.get('/iuran-2025/warga', asyncHandler(getMigration2025IuranWargaDetail));
router.post('/iuran-2025', asyncHandler(saveMigration2025Iuran));
router.post('/iuran-2025/apply-opening-2026', asyncHandler(applyMigration2025Opening2026));

router.get('/internet-2025/summary', asyncHandler(getMigration2025InternetSummary));
router.get('/internet-2025/tariffs', asyncHandler(getMigration2025InternetTariffs));
router.get('/internet-2025/warga', asyncHandler(getMigration2025InternetWargaDetail));
router.post('/internet-2025', asyncHandler(saveMigration2025Internet));

router.get('/lingkungan-2025/summary', asyncHandler(getMigration2025LingkunganSummary));
router.get('/lingkungan-2025/tariffs', asyncHandler(getMigration2025LingkunganTariffs));
router.get('/lingkungan-2025/warga', asyncHandler(getMigration2025LingkunganWargaDetail));
router.post('/lingkungan-2025', asyncHandler(saveMigration2025Lingkungan));

router.get('/jimpitan-2025/summary', asyncHandler(getMigration2025JimpitanSummary));
router.get('/jimpitan-2025/tariffs', asyncHandler(getMigration2025JimpitanTariffs));
router.get('/jimpitan-2025/warga', asyncHandler(getMigration2025JimpitanWargaDetail));
router.post('/jimpitan-2025', asyncHandler(saveMigration2025Jimpitan));

router.get('/tabungan-2025/summary', asyncHandler(getMigration2025TabunganSummary));
router.get('/tabungan-2025/warga', asyncHandler(getMigration2025TabunganWargaDetail));
router.post('/tabungan-2025', asyncHandler(saveMigration2025Tabungan));

router.get('/sosial-2025/summary', asyncHandler(getMigration2025SosialSummary));
router.get('/sosial-2025/detail', asyncHandler(getMigration2025SosialDetail));
router.post('/sosial-2025', asyncHandler(saveMigration2025Sosial));

router.get('/koperasi-iuran-2025/summary', asyncHandler(getMigration2025KoperasiIuranSummary));
router.get('/koperasi-iuran-2025/warga', asyncHandler(getMigration2025KoperasiIuranWargaDetail));
router.post('/koperasi-iuran-2025', asyncHandler(saveMigration2025KoperasiIuran));

router.get('/koperasi-loans-2025/summary', asyncHandler(getMigration2025KoperasiLoansSummary));
router.post('/koperasi-loans-2025', asyncHandler(saveMigration2025KoperasiLoans));

export default router;
