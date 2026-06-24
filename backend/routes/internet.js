import express from 'express';
import { auth, asyncHandler } from '../middleware/auth.js';
import { allowRoles } from '../middleware/role.js';
import {
  getInternetHistoryHandler,
  getInternetMembersHandler,
  getInternetSummaryHandler,
  getInternetTariffsHandler,
  postInternetMembersResetStartMonthHandler,
  postInternetMemberSetActiveHandler,
  postInternetExpenseHandler,
  postInternetPaymentHandler,
  postInternetTariffHandler
} from '../controllers/internetController.js';

const router = express.Router();
router.use(auth);

router.get('/summary', allowRoles('Admin Internet', 'Ketua'), asyncHandler(getInternetSummaryHandler));
router.get('/history', allowRoles('Admin Internet', 'Ketua'), asyncHandler(getInternetHistoryHandler));
router.get('/tariffs', allowRoles('Admin Internet', 'Ketua'), asyncHandler(getInternetTariffsHandler));
router.get('/members', allowRoles('Admin Internet', 'Ketua'), asyncHandler(getInternetMembersHandler));
router.post('/payment', allowRoles('Admin Internet'), asyncHandler(postInternetPaymentHandler));
router.post('/expense', allowRoles('Admin Internet'), asyncHandler(postInternetExpenseHandler));
router.post('/tariff', allowRoles('Admin Internet'), asyncHandler(postInternetTariffHandler));
router.post('/members/set-active', allowRoles('Admin Internet'), asyncHandler(postInternetMemberSetActiveHandler));
router.post('/members/reset-start-month', allowRoles('root'), asyncHandler(postInternetMembersResetStartMonthHandler));

export default router;
