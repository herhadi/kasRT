import express from 'express';
import { auth, asyncHandler } from '../middleware/auth.js';
import { getApprovalHistory, getPendingApprovals } from '../controllers/approvalController.js';

const router = express.Router();

router.get('/pending', auth, asyncHandler(getPendingApprovals));
router.get('/history', auth, asyncHandler(getApprovalHistory));

export default router;
