import express from 'express';
import { auth, asyncHandler } from '../middleware/auth.js';
import { allowRoles } from '../middleware/role.js';
import { addWargaUser, editWargaUser, getUserManagementData, updateUserAdminRoles } from '../controllers/userAdminController.js';
import { getMeetingAttendance, getMeetingNote, saveMeetingAttendance, saveMeetingNote } from '../controllers/meetingController.js';
import { deleteTelegramWebhook, getTelegramWebhookInfo, setTelegramWebhook } from '../controllers/telegramController.js';
import { cronHealthPing, cronHealthStatus } from '../controllers/cronHealthController.js';
import { confirmAssetRentalPaymentHandler, getAssetManagementData, recordAssetRental, saveAsset, updateAssetStatus } from '../controllers/assetController.js';

const router = express.Router();

router.post('/cron/ping', asyncHandler(cronHealthPing));

router.use(auth);

router.get('/users', allowRoles('Ketua', 'Sekretaris'), asyncHandler(getUserManagementData));
router.get('/meeting-note', allowRoles('Ketua', 'Sekretaris'), asyncHandler(getMeetingNote));
router.get('/meeting-attendance', allowRoles('Ketua', 'Sekretaris'), asyncHandler(getMeetingAttendance));
router.post('/users', allowRoles('Sekretaris'), asyncHandler(addWargaUser));
router.post('/users/:id/edit', allowRoles('Sekretaris'), asyncHandler(editWargaUser));
router.post('/users/:id/admin-roles', allowRoles('Sekretaris'), asyncHandler(updateUserAdminRoles));
router.post('/meeting-note', allowRoles('Sekretaris'), asyncHandler(saveMeetingNote));
router.post('/meeting-attendance', allowRoles('Sekretaris'), asyncHandler(saveMeetingAttendance));
router.get('/telegram/webhook-info', allowRoles('root'), asyncHandler(getTelegramWebhookInfo));
router.post('/telegram/set-webhook', allowRoles('root'), asyncHandler(setTelegramWebhook));
router.post('/telegram/delete-webhook', allowRoles('root'), asyncHandler(deleteTelegramWebhook));
router.get('/cron/status', allowRoles('root'), asyncHandler(cronHealthStatus));
router.get('/assets', allowRoles('Ketua', 'Plt Ketua', 'Sekretaris', 'Bendahara', 'root'), asyncHandler(getAssetManagementData));
router.post('/assets', allowRoles('Sekretaris', 'root'), asyncHandler(saveAsset));
router.post('/assets/:id/status', allowRoles('Sekretaris', 'root'), asyncHandler(updateAssetStatus));
router.post('/assets/rentals', allowRoles('Ketua', 'Plt Ketua', 'Sekretaris', 'root'), asyncHandler(recordAssetRental));
router.post('/assets/rentals/:id/confirm-payment', allowRoles('Bendahara', 'root'), asyncHandler(confirmAssetRentalPaymentHandler));

export default router;
