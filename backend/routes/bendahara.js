import express from 'express';
import { auth, asyncHandler } from '../middleware/auth.js';
import { allowRoles } from '../middleware/role.js';
import {
  closeBookYear,
  getYearlyBook,
  getBendaharaMasterData,
  inputPengeluaranBulanan,
  openBookYear,
  setorIuranWajibWarga
} from '../controllers/bendaharaController.js';

const router = express.Router();

router.use(auth, allowRoles('Bendahara', 'root'));

router.get('/master', asyncHandler(getBendaharaMasterData));
router.get('/yearly-book', asyncHandler(getYearlyBook));
router.post('/setor-iuran-wajib', asyncHandler(setorIuranWajibWarga));
router.post('/pengeluaran', asyncHandler(inputPengeluaranBulanan));
router.post('/yearly-book/close', asyncHandler(closeBookYear));
router.post('/yearly-book/open', asyncHandler(openBookYear));

export default router;
