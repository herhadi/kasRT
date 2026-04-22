import express from 'express';
import { auth } from '../middleware/auth.js';
import { allowRoles } from '../middleware/role.js';

import {
  approveExpense,
  approveTransfer,
  expense,
  expenseSosial,
  transferSosialBulanan,
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
  allowRoles('Ketua', 'Sekretaris', 'root'),
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

router.post(
  '/transfer-sosial-bulanan',
  auth,
  allowRoles('Bendahara'),
  validateRequiredFields(['from_wallet', 'amount']),
  asyncHandler(transferSosialBulanan)
);

router.post(
  '/expense-sosial',
  auth,
  allowRoles('Admin Sosial'),
  validateRequiredFields(['amount', 'description']),
  asyncHandler(expenseSosial)
);

//
// ✅ APPROVE EXPENSE
//
router.post(
  '/approve-expense',
  auth,
  allowRoles('Ketua', 'Sekretaris', 'root'),
  validateRequiredFields(['transaction_id']),
  asyncHandler(approveExpense)
);

export default router;
