import express from 'express';
import { auth, asyncHandler } from '../middleware/auth.js';
import { allowRoles } from '../middleware/role.js';
import {
  createMyMembershipRequestHandler,
  listMembershipRequestsHandler,
  reviewMembershipRequestHandler
} from '../controllers/membershipRequestController.js';

const router = express.Router();
router.use(auth);

router.post('/request', asyncHandler(createMyMembershipRequestHandler));
router.get('/requests', allowRoles('Admin Internet', 'Admin Lingkungan', 'Admin Koperasi', 'Ketua', 'root'), asyncHandler(listMembershipRequestsHandler));
router.post('/review', allowRoles('Admin Internet', 'Admin Lingkungan', 'Admin Koperasi', 'root'), asyncHandler(reviewMembershipRequestHandler));

export default router;
