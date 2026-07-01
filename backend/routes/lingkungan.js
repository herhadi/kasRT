import express from 'express';
import { auth, asyncHandler } from '../middleware/auth.js';
import { allowRoles } from '../middleware/role.js';
import {
  getLingkunganHistoryHandler,
  getLingkunganMembersHandler,
  getLingkunganSummaryHandler,
  getLingkunganTariffsHandler,
  postLingkunganMemberSetActiveHandler,
  postLingkunganExpenseHandler,
  patchLingkunganPaymentHandler,
  postLingkunganPaymentHandler,
  postLingkunganTariffHandler
} from '../controllers/lingkunganController.js';

const router = express.Router();
router.use(auth);

router.get('/summary', allowRoles('Admin Lingkungan', 'Ketua'), asyncHandler(getLingkunganSummaryHandler));
router.get('/history', allowRoles('Admin Lingkungan', 'Ketua'), asyncHandler(getLingkunganHistoryHandler));
router.get('/tariffs', allowRoles('Admin Lingkungan', 'Ketua'), asyncHandler(getLingkunganTariffsHandler));
router.get('/members', allowRoles('Admin Lingkungan', 'Ketua'), asyncHandler(getLingkunganMembersHandler));
router.post('/payment', allowRoles('Admin Lingkungan'), asyncHandler(postLingkunganPaymentHandler));
router.patch('/payment', allowRoles('Admin Lingkungan'), asyncHandler(patchLingkunganPaymentHandler));
router.post('/expense', allowRoles('Admin Lingkungan'), asyncHandler(postLingkunganExpenseHandler));
router.post('/tariff', allowRoles('Admin Lingkungan'), asyncHandler(postLingkunganTariffHandler));
router.post('/members/set-active', allowRoles('Admin Lingkungan'), asyncHandler(postLingkunganMemberSetActiveHandler));

export default router;
