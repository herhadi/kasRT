import express from 'express';
import { auth, asyncHandler } from '../middleware/auth.js';
import { allowRoles } from '../middleware/role.js';
import {
  activateLoanHandler,
  createLoanDraftHandler,
  koperasiIuranSummaryHandler,
  koperasiMemberSetActiveHandler,
  koperasiMembersHandler,
  koperasiRegisterMemberHandler,
  koperasiSetMonthlyFeeHandler,
  koperasiSummaryHandler,
  paymentLoanHandler,
  previewLoanPlanHandler
} from '../controllers/koperasiController.js';

const router = express.Router();
router.use(auth);

router.post('/loan/preview', allowRoles('Admin Koperasi', 'Ketua'), asyncHandler(previewLoanPlanHandler));
router.post('/loan/draft', allowRoles('Admin Koperasi'), asyncHandler(createLoanDraftHandler));
router.post('/loan/activate', allowRoles('Admin Koperasi'), asyncHandler(activateLoanHandler));
router.post('/loan/payment', allowRoles('Admin Koperasi'), asyncHandler(paymentLoanHandler));
router.get('/members', allowRoles('Admin Koperasi', 'Ketua'), asyncHandler(koperasiMembersHandler));
router.post('/members/set-active', allowRoles('Admin Koperasi'), asyncHandler(koperasiMemberSetActiveHandler));
router.post('/members/register', allowRoles('Admin Koperasi'), asyncHandler(koperasiRegisterMemberHandler));
router.post('/iuran/monthly-fee', allowRoles('Admin Koperasi'), asyncHandler(koperasiSetMonthlyFeeHandler));
router.get('/iuran/summary', allowRoles('Admin Koperasi', 'Ketua'), asyncHandler(koperasiIuranSummaryHandler));
router.get('/summary', allowRoles('Admin Koperasi', 'Ketua'), asyncHandler(koperasiSummaryHandler));

export default router;
