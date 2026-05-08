import express from 'express';
import { auth, asyncHandler } from '../middleware/auth.js';
import { allowRoles } from '../middleware/role.js';
import {
  getInternetHistoryHandler,
  getInternetMembersHandler,
  getInternetSummaryHandler,
  getInternetTariffsHandler,
  postInternetMemberSetActiveHandler,
  postInternetExpenseHandler,
  postInternetPaymentHandler,
  postInternetTariffHandler
} from '../controllers/internetController.js';

const router = express.Router();
router.use(auth);

router.get('/summary', allowRoles('Admin Internet', 'Ketua', 'Sekretaris', 'root'), asyncHandler(getInternetSummaryHandler));
router.get('/history', allowRoles('Admin Internet', 'Ketua', 'Sekretaris', 'root'), asyncHandler(getInternetHistoryHandler));
router.get('/tariffs', allowRoles('Admin Internet', 'Ketua', 'Sekretaris', 'root'), asyncHandler(getInternetTariffsHandler));
router.get('/members', allowRoles('Admin Internet', 'Ketua', 'Sekretaris', 'root'), asyncHandler(getInternetMembersHandler));
router.post('/payment', allowRoles('Admin Internet', 'root'), asyncHandler(postInternetPaymentHandler));
router.post('/expense', allowRoles('Admin Internet', 'root'), asyncHandler(postInternetExpenseHandler));
router.post('/tariff', allowRoles('Admin Internet', 'root'), asyncHandler(postInternetTariffHandler));
router.post('/members/set-active', allowRoles('Admin Internet', 'root'), asyncHandler(postInternetMemberSetActiveHandler));

export default router;
