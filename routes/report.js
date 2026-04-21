// Report saldo
outer.get('/saldo', async (req, res) => {
  const result = await pool.query(`
    SELECT 
      w.name,
      COALESCE(SUM(
        CASE 
          WHEN t.type = 'IN' THEN t.amount
          WHEN t.type = 'OUT' THEN -t.amount
          WHEN t.type = 'TRANSFER' AND t.target_wallet_id = w.id THEN t.amount
          WHEN t.type = 'TRANSFER' AND t.source_wallet_id = w.id THEN -t.amount
          ELSE 0
        END
      ),0) as saldo
    FROM wallets w
    LEFT JOIN transactions t 
      ON (t.target_wallet_id = w.id OR t.source_wallet_id = w.id)
      AND t.status = 'APPROVED'
    GROUP BY w.name
  `);

  res.json(result.rows);
});