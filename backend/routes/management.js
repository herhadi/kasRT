import express from 'express';
import { auth, asyncHandler } from '../middleware/auth.js';
import { allowRoles } from '../middleware/role.js';
import {
  addWargaUser,
  getUserManagementData,
  updateUserAdminRoles
} from '../controllers/managementController.js';

const router = express.Router();

router.use(auth, allowRoles('Ketua', 'Sekretaris', 'root'));

router.get('/users', asyncHandler(getUserManagementData));
router.post('/users', asyncHandler(addWargaUser));
router.post('/users/:id/admin-roles', asyncHandler(updateUserAdminRoles));

export default router;
