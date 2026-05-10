import express from 'express';
import { auth, asyncHandler } from '../middleware/auth.js';
import { allowRoles } from '../middleware/role.js';
import { securityReportCreateHandler, securityReportListHandler, securityReportStatusHandler } from '../controllers/securityController.js';

const router = express.Router();
router.use(auth);

router.get('/reports', allowRoles('Admin Keamanan', 'Ketua'), asyncHandler(securityReportListHandler));
router.post('/reports', allowRoles('Admin Keamanan'), asyncHandler(securityReportCreateHandler));
router.post('/reports/status', allowRoles('Admin Keamanan'), asyncHandler(securityReportStatusHandler));

export default router;
