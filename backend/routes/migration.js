import express from 'express';
import { auth, asyncHandler } from '../middleware/auth.js';
import { allowRoles } from '../middleware/role.js';
import {
  applyMigration2025Opening2026,
  getMigration2025InternetSummary,
  getMigration2025InternetTariffs,
  getMigration2025InternetMembers,
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
  getMigration2025LingkunganMembers,
  getMigration2025LingkunganWargaDetail,
  getMigration2025SosialDetail,
  getMigration2025SosialSummary,
  getMigration2025TabunganSummary,
  getMigration2025TabunganWargaDetail,
  getMigrationModuleOpeningBalance,
  saveMigration2025Internet,
  saveMigration2025Iuran,
  saveMigration2025Jimpitan,
  saveMigration2025KoperasiIuran,
  saveMigration2025KoperasiLoans,
  saveMigration2025Lingkungan,
  saveMigration2025Sosial,
  saveMigration2025Tabungan,
  saveMigrationModuleOpeningBalance
} from '../controllers/migrationController.js';

const router = express.Router();

router.use(auth, allowRoles('root'));

router.get('/:module-:year/opening-balance', asyncHandler(getMigrationModuleOpeningBalance));
router.post('/:module-:year/opening-balance', asyncHandler(saveMigrationModuleOpeningBalance));

router.get('/iuran-2025/summary', asyncHandler(getMigration2025IuranSummary));
router.get('/iuran-2025/tariffs', asyncHandler(getMigration2025IuranTariffs));
router.get('/iuran-2025/warga', asyncHandler(getMigration2025IuranWargaDetail));
router.post('/iuran-2025', asyncHandler(saveMigration2025Iuran));
router.post('/iuran-2025/apply-opening-2026', asyncHandler(applyMigration2025Opening2026));
// year-aware routes
router.get('/iuran-:year/summary', asyncHandler(getMigration2025IuranSummary));
router.get('/iuran-:year/tariffs', asyncHandler(getMigration2025IuranTariffs));
router.get('/iuran-:year/warga', asyncHandler(getMigration2025IuranWargaDetail));
router.post('/iuran-:year', asyncHandler(saveMigration2025Iuran));
router.post('/iuran-:year/apply-opening-:nextYear', asyncHandler(applyMigration2025Opening2026));

router.get('/internet-2025/summary', asyncHandler(getMigration2025InternetSummary));
router.get('/internet-2025/tariffs', asyncHandler(getMigration2025InternetTariffs));
router.get('/internet-2025/members', asyncHandler(getMigration2025InternetMembers));
router.get('/internet-2025/warga', asyncHandler(getMigration2025InternetWargaDetail));
router.post('/internet-2025', asyncHandler(saveMigration2025Internet));
// year-aware routes
router.get('/internet-:year/summary', asyncHandler(getMigration2025InternetSummary));
router.get('/internet-:year/tariffs', asyncHandler(getMigration2025InternetTariffs));
router.get('/internet-:year/members', asyncHandler(getMigration2025InternetMembers));
router.get('/internet-:year/warga', asyncHandler(getMigration2025InternetWargaDetail));
router.post('/internet-:year', asyncHandler(saveMigration2025Internet));

router.get('/lingkungan-2025/summary', asyncHandler(getMigration2025LingkunganSummary));
router.get('/lingkungan-2025/tariffs', asyncHandler(getMigration2025LingkunganTariffs));
router.get('/lingkungan-2025/members', asyncHandler(getMigration2025LingkunganMembers));
router.get('/lingkungan-2025/warga', asyncHandler(getMigration2025LingkunganWargaDetail));
router.post('/lingkungan-2025', asyncHandler(saveMigration2025Lingkungan));
// year-aware routes
router.get('/lingkungan-:year/summary', asyncHandler(getMigration2025LingkunganSummary));
router.get('/lingkungan-:year/tariffs', asyncHandler(getMigration2025LingkunganTariffs));
router.get('/lingkungan-:year/members', asyncHandler(getMigration2025LingkunganMembers));
router.get('/lingkungan-:year/warga', asyncHandler(getMigration2025LingkunganWargaDetail));
router.post('/lingkungan-:year', asyncHandler(saveMigration2025Lingkungan));

router.get('/jimpitan-2025/summary', asyncHandler(getMigration2025JimpitanSummary));
router.get('/jimpitan-2025/tariffs', asyncHandler(getMigration2025JimpitanTariffs));
router.get('/jimpitan-2025/warga', asyncHandler(getMigration2025JimpitanWargaDetail));
router.post('/jimpitan-2025', asyncHandler(saveMigration2025Jimpitan));
// year-aware routes
router.get('/jimpitan-:year/summary', asyncHandler(getMigration2025JimpitanSummary));
router.get('/jimpitan-:year/tariffs', asyncHandler(getMigration2025JimpitanTariffs));
router.get('/jimpitan-:year/warga', asyncHandler(getMigration2025JimpitanWargaDetail));
router.post('/jimpitan-:year', asyncHandler(saveMigration2025Jimpitan));

router.get('/tabungan-2025/summary', asyncHandler(getMigration2025TabunganSummary));
router.get('/tabungan-2025/warga', asyncHandler(getMigration2025TabunganWargaDetail));
router.post('/tabungan-2025', asyncHandler(saveMigration2025Tabungan));
// year-aware routes
router.get('/tabungan-:year/summary', asyncHandler(getMigration2025TabunganSummary));
router.get('/tabungan-:year/warga', asyncHandler(getMigration2025TabunganWargaDetail));
router.post('/tabungan-:year', asyncHandler(saveMigration2025Tabungan));

router.get('/sosial-2025/summary', asyncHandler(getMigration2025SosialSummary));
router.get('/sosial-2025/detail', asyncHandler(getMigration2025SosialDetail));
router.post('/sosial-2025', asyncHandler(saveMigration2025Sosial));
// year-aware routes
router.get('/sosial-:year/summary', asyncHandler(getMigration2025SosialSummary));
router.get('/sosial-:year/detail', asyncHandler(getMigration2025SosialDetail));
router.post('/sosial-:year', asyncHandler(saveMigration2025Sosial));

router.get('/koperasi-iuran-2025/summary', asyncHandler(getMigration2025KoperasiIuranSummary));
router.get('/koperasi-iuran-2025/warga', asyncHandler(getMigration2025KoperasiIuranWargaDetail));
router.post('/koperasi-iuran-2025', asyncHandler(saveMigration2025KoperasiIuran));
// year-aware routes
router.get('/koperasi-iuran-:year/summary', asyncHandler(getMigration2025KoperasiIuranSummary));
router.get('/koperasi-iuran-:year/warga', asyncHandler(getMigration2025KoperasiIuranWargaDetail));
router.post('/koperasi-iuran-:year', asyncHandler(saveMigration2025KoperasiIuran));

router.get('/koperasi-loans-2025/summary', asyncHandler(getMigration2025KoperasiLoansSummary));
router.post('/koperasi-loans-2025', asyncHandler(saveMigration2025KoperasiLoans));
// year-aware routes
router.get('/koperasi-loans-:year/summary', asyncHandler(getMigration2025KoperasiLoansSummary));
router.post('/koperasi-loans-:year', asyncHandler(saveMigration2025KoperasiLoans));

export default router;
