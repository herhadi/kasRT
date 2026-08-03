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
  , getTabunganSurplusHistoryHandler, postTabunganYearlySurplusHandler, patchTabunganSurplusCashHandler
  , requestTabunganWithdrawal, getPendingTabunganWithdrawals, decideTabunganWithdrawalHandler
} from '../controllers/tabunganController.js';

const router = express.Router();
router.use(auth);

router.get('/summary', allowRoles('Admin Pembangunan', 'Ketua', 'Sekretaris'), asyncHandler(getTabunganSummary));
router.get('/members', allowRoles('Admin Pembangunan', 'Ketua', 'Sekretaris'), asyncHandler(getTabunganMembersHandler));
router.get('/tariffs', allowRoles('Admin Pembangunan', 'Ketua', 'Sekretaris'), asyncHandler(getTabunganTariffsHandler));
router.get('/history', allowRoles('Admin Pembangunan', 'Ketua', 'Sekretaris'), asyncHandler(getTabunganHistory));
router.get('/event-detail', allowRoles('Admin Pembangunan', 'Ketua', 'Sekretaris'), asyncHandler(getKebutuhanKhususDetail));
router.get('/yearly-book', allowRoles('Admin Pembangunan', 'Ketua', 'Sekretaris'), asyncHandler(getTabunganYearlyBookHandler));
router.get('/surplus-history', allowRoles('Admin Pembangunan', 'Ketua', 'Sekretaris'), asyncHandler(getTabunganSurplusHistoryHandler));
router.post('/setor', allowRoles('Admin Pembangunan'), asyncHandler(inputTabunganWarga));
router.post('/withdrawal-requests', allowRoles('Warga'), asyncHandler(requestTabunganWithdrawal));
router.get('/withdrawal-requests/pending', allowRoles('Admin Pembangunan', 'root'), asyncHandler(getPendingTabunganWithdrawals));
router.post('/withdrawal-requests/:id/decision', allowRoles('Admin Pembangunan', 'root'), asyncHandler(decideTabunganWithdrawalHandler));
router.patch('/setor', allowRoles('Admin Pembangunan'), asyncHandler(patchTabunganSetoran));
router.post('/members/set-active', allowRoles('Admin Pembangunan'), asyncHandler(postTabunganMemberSetActiveHandler));
router.post('/tariff', allowRoles('Admin Pembangunan'), asyncHandler(postTabunganTariffHandler));
router.post('/kebutuhan-khusus', allowRoles('Admin Pembangunan'), asyncHandler(createKebutuhanKhusus));
router.post('/year-close', allowRoles('Admin Pembangunan'), asyncHandler(closeTabunganYearHandler));
router.post('/surplus-history', allowRoles('Admin Pembangunan'), asyncHandler(postTabunganYearlySurplusHandler));
router.patch('/surplus-history/:id/cash', allowRoles('Admin Pembangunan'), asyncHandler(patchTabunganSurplusCashHandler));
router.post('/year-open', allowRoles('Admin Pembangunan'), asyncHandler(openTabunganYearHandler));

export default router;
