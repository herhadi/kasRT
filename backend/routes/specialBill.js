import express from 'express';
import { auth, asyncHandler } from '../middleware/auth.js';
import { allowRoles } from '../middleware/role.js';
import {
  createSpecialBillHandler,
  getMySpecialBills,
  getSpecialBillOptions,
  getSpecialBills,
  getSpecialBillTargets,
  hideSpecialBillHandler,
  setSpecialBillTargetActiveHandler
} from '../controllers/specialBillController.js';

const router = express.Router();

router.use(auth);

router.get('/my', asyncHandler(getMySpecialBills));
router.get('/options', allowRoles('Bendahara', 'root'), asyncHandler(getSpecialBillOptions));
router.get('/', allowRoles('Bendahara', 'root'), asyncHandler(getSpecialBills));
router.post('/', allowRoles('Bendahara', 'root'), asyncHandler(createSpecialBillHandler));
router.get('/:id/targets', allowRoles('Bendahara', 'root'), asyncHandler(getSpecialBillTargets));
router.post('/:id/targets/set-active', allowRoles('Bendahara', 'root'), asyncHandler(setSpecialBillTargetActiveHandler));
router.post('/:id/hide', allowRoles('Bendahara', 'root'), asyncHandler(hideSpecialBillHandler));

export default router;
