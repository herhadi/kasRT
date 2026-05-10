import express from 'express';
import { auth, asyncHandler } from '../middleware/auth.js';
import { allowRoles } from '../middleware/role.js';
import { addWargaUser, editWargaUser, getUserManagementData, updateUserAdminRoles } from '../controllers/userAdminController.js';
import { getMeetingAttendance, getMeetingNote, saveMeetingAttendance, saveMeetingNote } from '../controllers/meetingController.js';

const router = express.Router();

router.use(auth);

router.get('/users', allowRoles('Ketua', 'Sekretaris'), asyncHandler(getUserManagementData));
router.get('/meeting-note', allowRoles('Ketua', 'Sekretaris'), asyncHandler(getMeetingNote));
router.get('/meeting-attendance', allowRoles('Ketua', 'Sekretaris'), asyncHandler(getMeetingAttendance));
router.post('/users', allowRoles('Sekretaris'), asyncHandler(addWargaUser));
router.post('/users/:id/edit', allowRoles('Sekretaris'), asyncHandler(editWargaUser));
router.post('/users/:id/admin-roles', allowRoles('Sekretaris'), asyncHandler(updateUserAdminRoles));
router.post('/meeting-note', allowRoles('Sekretaris'), asyncHandler(saveMeetingNote));
router.post('/meeting-attendance', allowRoles('Sekretaris'), asyncHandler(saveMeetingAttendance));

export default router;
