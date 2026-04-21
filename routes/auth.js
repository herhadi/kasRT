import express from 'express';
import { pool } from '../db.js';

const router = express.Router();

// LOGIN
router.post('/login', async (req, res) => {
  const { no_hp, pin } = req.body;

  const result = await pool.query(
    `SELECT * FROM users WHERE no_hp = $1 AND pin = $2`,
    [no_hp, pin]
  );

  if (result.rows.length === 0) {
    return res.json({ success: false, message: 'Login gagal' });
  }

  const user = result.rows[0];

  res.json({
    success: true,
    user
  });
});

export default router;