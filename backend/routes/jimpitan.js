import express from 'express';
import { auth, asyncHandler, validateRequiredFields } from '../middleware/auth.js';
import { allowRoles } from '../middleware/role.js';
import {
  approveJimpitan,
  ajukanSetorKeBendahara,
  addJimpitanExternalParticipant,
  approveSetorJimpitanKeBendahara,
  editNominalJimpitan,
  getJimpitanSchedule,
  getJimpitanExternalParticipants,
  getJimpitanMembers,
  getDailyRecapJimpitan,
  getMyJimpitanRouteOrder,
  getSetorHistoryJimpitanAdmin,
  healthCheck,
  inputJimpitan,
  listJimpitan,
  resetBulananJimpitan,
  saveMyJimpitanRouteOrder,
  sendJimpitanShiftReminder,
  updateJimpitanExternalParticipantStatus,
  updateJimpitanMemberStatus,
  setPetugasShift,
  setorJimpitan,
  topUpJimpitan
} from '../controllers/jimpitanController.js';

const router = express.Router();

router.get('/', asyncHandler(healthCheck));

router.post(
  '/input',
  auth,
  validateRequiredFields(['nominal']),
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
  '/edit-nominal',
  auth,
  allowRoles('Admin Jimpitan', 'root'),
  validateRequiredFields(['warga_id', 'nominal']),
  asyncHandler(editNominalJimpitan)
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

router.post(
  '/approve-setor-bendahara',
  auth,
  allowRoles('Bendahara', 'root'),
  asyncHandler(approveSetorJimpitanKeBendahara)
);

router.get(
  '/setor-history',
  auth,
  allowRoles('Admin Jimpitan', 'Ketua'),
  asyncHandler(getSetorHistoryJimpitanAdmin)
);

router.get('/list', auth, asyncHandler(listJimpitan));
router.get('/daily-recap', auth, allowRoles('Admin Jimpitan', 'Ketua'), asyncHandler(getDailyRecapJimpitan));
router.get('/route-order', auth, asyncHandler(getMyJimpitanRouteOrder));
router.post('/route-order', auth, asyncHandler(saveMyJimpitanRouteOrder));

router.get(
  '/schedule',
  auth,
  asyncHandler(getJimpitanSchedule)
);

router.get(
  '/external-participants',
  auth,
  allowRoles('Admin Jimpitan', 'root'),
  asyncHandler(getJimpitanExternalParticipants)
);

router.get(
  '/members',
  auth,
  allowRoles('Admin Jimpitan', 'root'),
  asyncHandler(getJimpitanMembers)
);

router.post(
  '/members/status',
  auth,
  allowRoles('Admin Jimpitan', 'root'),
  validateRequiredFields(['warga_id', 'status']),
  asyncHandler(updateJimpitanMemberStatus)
);

router.post(
  '/external-participants',
  auth,
  allowRoles('Admin Jimpitan', 'root'),
  asyncHandler(addJimpitanExternalParticipant)
);

router.post(
  '/external-participants/:id/status',
  auth,
  allowRoles('Admin Jimpitan', 'root'),
  asyncHandler(updateJimpitanExternalParticipantStatus)
);

router.post(
  '/send-shift-reminder',
  asyncHandler(sendJimpitanShiftReminder)
);

router.post(
  '/set-petugas-shift',
  auth,
  allowRoles('Admin Jimpitan', 'root'),
  validateRequiredFields(['user_id']),
  asyncHandler(setPetugasShift)
);

export default router;
