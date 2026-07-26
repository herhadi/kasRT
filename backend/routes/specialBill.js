import express from 'express';
import { auth, asyncHandler } from '../middleware/auth.js';
import { allowRoles } from '../middleware/role.js';
import {
  approveSpecialBillBatchHandler,
  createSpecialBillHandler,
  getSpecialBillMembers,
  getMySpecialBills,
  getMyPicSpecialBills,
  getSpecialBillOptions,
  getSpecialBillPaymentHistory,
  getSpecialBills,
  getSpecialBillTargets,
  hideSpecialBillHandler,
  recordSpecialBillPaymentHandler,
  submitSpecialBillBatchHandler,
  setSpecialBillMemberActiveHandler,
  setSpecialBillTargetActiveHandler,
  updateSpecialBillPaymentHandler
} from '../controllers/specialBillController.js';

const router = express.Router();

router.use(auth);

router.get('/my', asyncHandler(getMySpecialBills));
router.get('/pic', asyncHandler(getMyPicSpecialBills));
router.get('/options', allowRoles('Bendahara', 'root'), asyncHandler(getSpecialBillOptions));
router.get('/members', allowRoles('Bendahara', 'root'), asyncHandler(getSpecialBillMembers));
router.get('/', allowRoles('Bendahara', 'root'), asyncHandler(getSpecialBills));
router.post('/', allowRoles('Bendahara', 'root'), asyncHandler(createSpecialBillHandler));
router.post('/approve-batch', allowRoles('Bendahara', 'root'), asyncHandler(approveSpecialBillBatchHandler));
router.post('/members/set-active', allowRoles('Bendahara', 'root'), asyncHandler(setSpecialBillMemberActiveHandler));
router.get('/:id/targets', asyncHandler(getSpecialBillTargets));
router.get('/:id/payments', asyncHandler(getSpecialBillPaymentHistory));
router.post('/:id/targets/set-active', allowRoles('Bendahara', 'root'), asyncHandler(setSpecialBillTargetActiveHandler));
router.post('/:id/payment', asyncHandler(recordSpecialBillPaymentHandler));
router.patch('/:id/payments/:paymentId', asyncHandler(updateSpecialBillPaymentHandler));
router.post('/:id/submit-batch', asyncHandler(submitSpecialBillBatchHandler));
router.post('/:id/hide', allowRoles('Bendahara', 'root'), asyncHandler(hideSpecialBillHandler));

export default router;
