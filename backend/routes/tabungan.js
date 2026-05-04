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

router.get('/summary', allowRoles('Admin Pembangunan', 'Bendahara', 'Ketua', 'Sekretaris', 'root'), asyncHandler(getTabunganSummary));
router.get('/history', allowRoles('Admin Pembangunan', 'Bendahara', 'Ketua', 'Sekretaris', 'root'), asyncHandler(getTabunganHistory));
router.get('/event-detail', allowRoles('Admin Pembangunan', 'Bendahara', 'Ketua', 'Sekretaris', 'root'), asyncHandler(getKebutuhanKhususDetail));
router.get('/yearly-book', allowRoles('Admin Pembangunan', 'Bendahara', 'Ketua', 'Sekretaris', 'root'), asyncHandler(getTabunganYearlyBookHandler));
router.post('/setor', allowRoles('Admin Pembangunan', 'Bendahara', 'root'), asyncHandler(inputTabunganWarga));
router.post('/kebutuhan-khusus', allowRoles('Admin Pembangunan', 'Bendahara', 'root'), asyncHandler(createKebutuhanKhusus));
router.post('/year-close', allowRoles('Admin Pembangunan', 'Bendahara', 'root'), asyncHandler(closeTabunganYearHandler));
router.post('/year-open', allowRoles('Admin Pembangunan', 'Bendahara', 'root'), asyncHandler(openTabunganYearHandler));

export default router;
