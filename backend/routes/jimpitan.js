import express from 'express';
import { auth } from '../middleware/auth.js';
import { allowRoles } from '../middleware/role.js';

import {
  approveJimpitan,
  healthCheck,
  inputJimpitan,
  listJimpitan,
  setorJimpitan
} from '../controllers/jimpitanController.js';

import { asyncHandler, validateRequiredFields } from '../middleware/auth.js';

const router = express.Router();

//
// 🧪 HEALTH CHECK
//
router.get('/', asyncHandler(healthCheck));

//
// 🌾 INPUT JIMPITAN
//
router.post(
  '/input',
  auth,
  validateRequiredFields(['warga_id', 'nominal']),
  asyncHandler(inputJimpitan)
);

//
// 📦 SETOR JIMPITAN
//
router.post(
  '/setor',
  auth,
  validateRequiredFields(['detail_ids']),
  asyncHandler(setorJimpitan)
);

//
// ✅ APPROVE JIMPITAN (ADMIN JIMPITAN ONLY)
//
router.post(
  '/approve',
  auth,
  allowRoles('Admin Jimpitan'),
  validateRequiredFields(['batch_id']),
  asyncHandler(approveJimpitan)
);

//
// 📊 LIST
//
router.get(
  '/list',
  auth, // optional tapi recommended
  asyncHandler(listJimpitan)
);

export default router;