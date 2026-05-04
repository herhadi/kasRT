import express from 'express';
import { auth, asyncHandler } from '../middleware/auth.js';
import { allowRoles } from '../middleware/role.js';
import {
  closeBookYear,
  getYearlyBook,
  getBendaharaMasterData,
  getOpeningArrears,
  inputPengeluaranBulanan,
  openBookYear,
  saveOpeningArrears,
  setorIuranWajibWarga
} from '../controllers/bendaharaController.js';

const router = express.Router();

router.use(auth);

router.get('/master', allowRoles('Bendahara', 'Ketua', 'Sekretaris', 'root'), asyncHandler(getBendaharaMasterData));
router.get('/opening-arrears', allowRoles('Bendahara', 'Ketua', 'Sekretaris', 'root'), asyncHandler(getOpeningArrears));
router.get('/yearly-book', allowRoles('Bendahara', 'Ketua', 'Sekretaris', 'root'), asyncHandler(getYearlyBook));
router.post('/setor-iuran-wajib', allowRoles('Bendahara', 'root'), asyncHandler(setorIuranWajibWarga));
router.post('/opening-arrears', allowRoles('Bendahara', 'root'), asyncHandler(saveOpeningArrears));
router.post('/pengeluaran', allowRoles('Bendahara', 'root'), asyncHandler(inputPengeluaranBulanan));
router.post('/yearly-book/close', allowRoles('Bendahara', 'root'), asyncHandler(closeBookYear));
router.post('/yearly-book/open', allowRoles('Bendahara', 'root'), asyncHandler(openBookYear));

export default router;
