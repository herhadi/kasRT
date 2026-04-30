import express from 'express';
import { auth, asyncHandler } from '../middleware/auth.js';
import { allowRoles } from '../middleware/role.js';
import {
  closeTabunganYearHandler,
  createKebutuhanKhusus,
  getKebutuhanKhususDetail,
  getTabunganHistory,
  getTabunganSummary,
  getTabunganYearlyBookHandler,
  inputTabunganWarga,
  openTabunganYearHandler
} from '../controllers/tabunganController.js';

const router = express.Router();

router.use(auth, allowRoles('Admin Pembangunan', 'Bendahara', 'root'));

router.get('/summary', asyncHandler(getTabunganSummary));
router.get('/history', asyncHandler(getTabunganHistory));
router.get('/event-detail', asyncHandler(getKebutuhanKhususDetail));
router.get('/yearly-book', asyncHandler(getTabunganYearlyBookHandler));
router.post('/setor', asyncHandler(inputTabunganWarga));
router.post('/kebutuhan-khusus', asyncHandler(createKebutuhanKhusus));
router.post('/year-close', asyncHandler(closeTabunganYearHandler));
router.post('/year-open', asyncHandler(openTabunganYearHandler));

export default router;
