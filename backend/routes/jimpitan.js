import express from 'express';
import { auth, asyncHandler, validateRequiredFields } from '../middleware/auth.js';
import { allowRoles } from '../middleware/role.js';
import {
  approveJimpitan,
  ajukanSetorKeBendahara,
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
  validateRequiredFields(['warga_id', 'nominal']),
  asyncHandler(inputJimpitan)
);

router.post(
  '/setor',
  auth,
  asyncHandler(setorJimpitan)
);

router.post(
  '/approve',
  auth,
  allowRoles('Admin Jimpitan', 'root'),
  validateRequiredFields(['batch_id']),
  asyncHandler(approveJimpitan)
);

router.post(
  '/topup',
  auth,
  allowRoles('Admin Jimpitan', 'root'),
  validateRequiredFields(['warga_id', 'nominal']),
  asyncHandler(topUpJimpitan)
);

router.post(
  '/reset-bulanan',
  auth,
  allowRoles('Admin Jimpitan', 'root'),
  asyncHandler(resetBulananJimpitan)
);

router.post(
  '/ajukan-setor-bendahara',
  auth,
  allowRoles('Admin Jimpitan', 'root'),
  asyncHandler(ajukanSetorKeBendahara)
);

router.get('/list', auth, asyncHandler(listJimpitan));

export default router;
