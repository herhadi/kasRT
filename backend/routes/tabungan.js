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
router.use(auth);

router.get('/summary', allowRoles('Admin Pembangunan', 'Ketua'), asyncHandler(getTabunganSummary));
router.get('/history', allowRoles('Admin Pembangunan', 'Ketua'), asyncHandler(getTabunganHistory));
router.get('/event-detail', allowRoles('Admin Pembangunan', 'Ketua'), asyncHandler(getKebutuhanKhususDetail));
router.get('/yearly-book', allowRoles('Admin Pembangunan', 'Ketua'), asyncHandler(getTabunganYearlyBookHandler));
router.post('/setor', allowRoles('Admin Pembangunan'), asyncHandler(inputTabunganWarga));
router.post('/kebutuhan-khusus', allowRoles('Admin Pembangunan'), asyncHandler(createKebutuhanKhusus));
router.post('/year-close', allowRoles('Admin Pembangunan'), asyncHandler(closeTabunganYearHandler));
router.post('/year-open', allowRoles('Admin Pembangunan'), asyncHandler(openTabunganYearHandler));

export default router;
