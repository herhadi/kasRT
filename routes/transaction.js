// Transfer antar kas
router.post('/transfer', async (req, res) => {
  const { from_wallet, to_wallet, amount, user_id } = req.body;

  await pool.query(`
    INSERT INTO transactions 
    (type, source_wallet_id, target_wallet_id, amount, status, created_by)
    VALUES ('TRANSFER', $1, $2, $3, 'PENDING', $4)
  `, [from_wallet, to_wallet, amount, user_id]);

  res.json({ success: true });
});

// Approve transfer (admin)
router.post('/approve-transfer', async (req, res) => {
  const { transaction_id, approver_id } = req.body;

  await pool.query(`
    UPDATE transactions
    SET status = 'APPROVED', approved_by = $1, approved_at = NOW()
    WHERE id = $2
  `, [approver_id, transaction_id]);

  res.json({ success: true });
});
