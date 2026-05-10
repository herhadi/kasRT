import express from 'express';
import { auth, asyncHandler } from '../middleware/auth.js';
import { allowRoles } from '../middleware/role.js';
import {
  closeBookYear,
  getYearlyBook,
  getBendaharaMasterData,
  getIuranWajibTariffs,
  getOpeningArrears,
  inputPengeluaranBulanan,
  openBookYear,
  postIuranWajibTariff,
  saveOpeningArrears,
  setorIuranWajibWarga
} from '../controllers/bendaharaController.js';

const router = express.Router();

router.use(auth);

router.get('/master', allowRoles('Bendahara', 'Ketua'), asyncHandler(getBendaharaMasterData));
router.get('/iuran-tariffs', allowRoles('Bendahara', 'Ketua'), asyncHandler(getIuranWajibTariffs));
router.get('/opening-arrears', allowRoles('Bendahara', 'Ketua'), asyncHandler(getOpeningArrears));
router.get('/yearly-book', allowRoles('Bendahara', 'Ketua'), asyncHandler(getYearlyBook));
router.post('/setor-iuran-wajib', allowRoles('Bendahara'), asyncHandler(setorIuranWajibWarga));
router.post('/iuran-tariff', allowRoles('Bendahara'), asyncHandler(postIuranWajibTariff));
router.post('/opening-arrears', allowRoles('Bendahara'), asyncHandler(saveOpeningArrears));
router.post('/pengeluaran', allowRoles('Bendahara'), asyncHandler(inputPengeluaranBulanan));
router.post('/yearly-book/close', allowRoles('Bendahara'), asyncHandler(closeBookYear));
router.post('/yearly-book/open', allowRoles('Bendahara'), asyncHandler(openBookYear));

export default router;
