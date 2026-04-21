import express from 'express';
import { auth, asyncHandler, validateRequiredFields } from '../middleware/auth.js';
import { allowRoles } from '../middleware/role.js';
import {
  approveJimpitan,
  healthCheck,
  inputJimpitan,
  listJimpitan,
  resetBulananJimpitan,
  setorJimpitan,
  topUpJimpitan
} from '../controllers/jimpitanController.js';

const router = express.Router();

router.get('/', asyncHandler(healthCheck));

router.post(
  '/input',
  auth,
  allowRoles('Warga', 'Petugas Jimpitan', 'Admin Jimpitan', 'Admin'),
  validateRequiredFields(['warga_id', 'nominal']),
  asyncHandler(inputJimpitan)
);

router.post(
  '/setor',
  auth,
  allowRoles('Warga', 'Petugas Jimpitan', 'Admin Jimpitan', 'Admin'),
  asyncHandler(setorJimpitan)
);

router.post(
  '/approve',
  auth,
  allowRoles('Admin Jimpitan', 'Admin'),
  validateRequiredFields(['batch_id']),
  asyncHandler(approveJimpitan)
);

router.post(
  '/topup',
  auth,
  allowRoles('Admin Jimpitan', 'Admin'),
  validateRequiredFields(['warga_id', 'nominal']),
  asyncHandler(topUpJimpitan)
);

router.post(
  '/reset-bulanan',
  auth,
  allowRoles('Admin Jimpitan', 'Admin'),
  asyncHandler(resetBulananJimpitan)
);

router.get('/list', auth, asyncHandler(listJimpitan));

export default router;
