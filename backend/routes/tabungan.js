import express from 'express';
import { auth, asyncHandler } from '../middleware/auth.js';
import { allowRoles } from '../middleware/role.js';
import {
  closeTabunganYearHandler,
  createKebutuhanKhusus,
  getKebutuhanKhususDetail,
  getTabunganMembersHandler,
  getTabunganHistory,
  getTabunganSummary,
  getTabunganTariffsHandler,
  getTabunganYearlyBookHandler,
  inputTabunganWarga,
  openTabunganYearHandler,
  patchTabunganSetoran,
  postTabunganMemberSetActiveHandler,
  postTabunganTariffHandler
} from '../controllers/tabunganController.js';

const router = express.Router();
router.use(auth);

router.get('/summary', allowRoles('Admin Pembangunan', 'Ketua'), asyncHandler(getTabunganSummary));
router.get('/members', allowRoles('Admin Pembangunan', 'Ketua'), asyncHandler(getTabunganMembersHandler));
router.get('/tariffs', allowRoles('Admin Pembangunan', 'Ketua'), asyncHandler(getTabunganTariffsHandler));
router.get('/history', allowRoles('Admin Pembangunan', 'Ketua'), asyncHandler(getTabunganHistory));
router.get('/event-detail', allowRoles('Admin Pembangunan', 'Ketua'), asyncHandler(getKebutuhanKhususDetail));
router.get('/yearly-book', allowRoles('Admin Pembangunan', 'Ketua'), asyncHandler(getTabunganYearlyBookHandler));
router.post('/setor', allowRoles('Admin Pembangunan'), asyncHandler(inputTabunganWarga));
router.patch('/setor', allowRoles('Admin Pembangunan'), asyncHandler(patchTabunganSetoran));
router.post('/members/set-active', allowRoles('Admin Pembangunan'), asyncHandler(postTabunganMemberSetActiveHandler));
router.post('/tariff', allowRoles('Admin Pembangunan'), asyncHandler(postTabunganTariffHandler));
router.post('/kebutuhan-khusus', allowRoles('Admin Pembangunan'), asyncHandler(createKebutuhanKhusus));
router.post('/year-close', allowRoles('Admin Pembangunan'), asyncHandler(closeTabunganYearHandler));
router.post('/year-open', allowRoles('Admin Pembangunan'), asyncHandler(openTabunganYearHandler));

export default router;
