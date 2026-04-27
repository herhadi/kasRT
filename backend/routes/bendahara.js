import express from 'express';
import { auth, asyncHandler } from '../middleware/auth.js';
import { allowRoles } from '../middleware/role.js';
import {
  getBendaharaMasterData,
  inputPengeluaranBulanan,
  setorIuranWajibWarga
} from '../controllers/bendaharaController.js';

const router = express.Router();

router.use(auth, allowRoles('Bendahara', 'root'));

router.get('/master', asyncHandler(getBendaharaMasterData));
router.post('/setor-iuran-wajib', asyncHandler(setorIuranWajibWarga));
router.post('/pengeluaran', asyncHandler(inputPengeluaranBulanan));

export default router;
