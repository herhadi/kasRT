import express from 'express';
import { auth, asyncHandler } from '../middleware/auth.js';
import { allowRoles } from '../middleware/role.js';
import {
  activateLoanHandler,
  createLoanDraftHandler,
  koperasiMemberSetActiveHandler,
  koperasiMembersHandler,
  koperasiSummaryHandler,
  paymentLoanHandler,
  previewLoanPlanHandler
} from '../controllers/koperasiController.js';

const router = express.Router();
router.use(auth);

router.post('/loan/preview', allowRoles('Admin Koperasi', 'Ketua', 'Sekretaris', 'root'), asyncHandler(previewLoanPlanHandler));
router.post('/loan/draft', allowRoles('Admin Koperasi', 'root'), asyncHandler(createLoanDraftHandler));
router.post('/loan/activate', allowRoles('Admin Koperasi', 'root'), asyncHandler(activateLoanHandler));
router.post('/loan/payment', allowRoles('Admin Koperasi', 'root'), asyncHandler(paymentLoanHandler));
router.get('/members', allowRoles('Admin Koperasi', 'Ketua', 'Sekretaris', 'root'), asyncHandler(koperasiMembersHandler));
router.post('/members/set-active', allowRoles('Admin Koperasi', 'root'), asyncHandler(koperasiMemberSetActiveHandler));
router.get('/summary', allowRoles('Admin Koperasi', 'Ketua', 'Sekretaris', 'root'), asyncHandler(koperasiSummaryHandler));

export default router;
