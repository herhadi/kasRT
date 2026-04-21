import express from 'express';
import { auth } from '../middleware/auth.js';
import { allowRoles } from '../middleware/role.js';

import {
  approveExpense,
  approveTransfer,
  expense,
  transfer
} from '../controllers/transactionController.js';

import { asyncHandler, validateRequiredFields } from '../middleware/auth.js';

const router = express.Router();

//
// 🔁 TRANSFER (BENDAHARA)
//
router.post(
  '/transfer',
  auth,
  allowRoles('Bendahara'),
  validateRequiredFields(['from_wallet', 'to_wallet', 'amount']),
  asyncHandler(transfer)
);

//
// ✅ APPROVE TRANSFER (KETUA / SEKRETARIS)
//
router.post(
  '/approve-transfer',
  auth,
  allowRoles('Ketua', 'Sekretaris'),
  validateRequiredFields(['transaction_id']),
  asyncHandler(approveTransfer)
);

//
// 💸 EXPENSE
//
router.post(
  '/expense',
  auth,
  allowRoles('Bendahara'),
  validateRequiredFields(['wallet_id', 'amount', 'description']),
  asyncHandler(expense)
);

//
// ✅ APPROVE EXPENSE
//
router.post(
  '/approve-expense',
  auth,
  allowRoles('Ketua', 'Sekretaris'),
  validateRequiredFields(['transaction_id']),
  asyncHandler(approveExpense)
);

export default router;