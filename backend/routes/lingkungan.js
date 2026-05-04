import express from 'express';
import { auth, asyncHandler } from '../middleware/auth.js';
import { allowRoles } from '../middleware/role.js';
import {
  getLingkunganHistoryHandler,
  getLingkunganSummaryHandler,
  getLingkunganTariffsHandler,
  postLingkunganExpenseHandler,
  postLingkunganPaymentHandler,
  postLingkunganTariffHandler
} from '../controllers/lingkunganController.js';

const router = express.Router();
router.use(auth);

router.get('/summary', allowRoles('Admin Lingkungan', 'Ketua', 'Sekretaris', 'root'), asyncHandler(getLingkunganSummaryHandler));
router.get('/history', allowRoles('Admin Lingkungan', 'Ketua', 'Sekretaris', 'root'), asyncHandler(getLingkunganHistoryHandler));
router.get('/tariffs', allowRoles('Admin Lingkungan', 'Ketua', 'Sekretaris', 'root'), asyncHandler(getLingkunganTariffsHandler));
router.post('/payment', allowRoles('Admin Lingkungan', 'root'), asyncHandler(postLingkunganPaymentHandler));
router.post('/expense', allowRoles('Admin Lingkungan', 'root'), asyncHandler(postLingkunganExpenseHandler));
router.post('/tariff', allowRoles('Admin Lingkungan', 'root'), asyncHandler(postLingkunganTariffHandler));

export default router;
