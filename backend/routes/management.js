import express from 'express';
import { auth, asyncHandler } from '../middleware/auth.js';
import { allowRoles } from '../middleware/role.js';
import { addWargaUser, getUserManagementData, updateUserAdminRoles } from '../controllers/userAdminController.js';
import { getMeetingAttendance, getMeetingNote, saveMeetingAttendance, saveMeetingNote } from '../controllers/meetingController.js';

const router = express.Router();

router.use(auth, allowRoles('Ketua', 'Sekretaris', 'root'));

router.get('/users', asyncHandler(getUserManagementData));
router.get('/meeting-note', asyncHandler(getMeetingNote));
router.get('/meeting-attendance', asyncHandler(getMeetingAttendance));
router.post('/users', asyncHandler(addWargaUser));
router.post('/users/:id/admin-roles', asyncHandler(updateUserAdminRoles));
router.post('/meeting-note', asyncHandler(saveMeetingNote));
router.post('/meeting-attendance', asyncHandler(saveMeetingAttendance));

export default router;
