import { pool } from '../db.js';
import jwt from 'jsonwebtoken';

export async function login(req, res) {
  const { no_hp, pin } = req.body;

  const result = await pool.query(
    'SELECT id, nama, pin, telegram_chat_id FROM users WHERE no_hp = $1',
    [no_hp]
  );

  if (result.rows.length === 0) {
    return res.json({ success: false, message: 'User tidak ditemukan' });
  }

  const user = result.rows[0];

  if (user.pin !== pin) {
    return res.json({ success: false, message: 'PIN salah' });
  }

  const rolesRes = await pool.query(
    `SELECT r.name
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1`,
    [user.id]
  );

  const roles = rolesRes.rows.map((r) => r.name);

  const token = jwt.sign(
    {
      user_id: user.id,
      roles
    },
    process.env.JWT_SECRET,
    { expiresIn: '1d' }
  );

  return res.json({
    success: true,
    token,
    user: {
      id: user.id,
      nama: user.nama,
      roles,
      telegram_connected: Boolean(user.telegram_chat_id)
    }
  });
}

export async function me(req, res) {
  const userId = req.user.user_id;

  const result = await pool.query(
    `SELECT id, nama, no_hp, telegram_chat_id
     FROM users
     WHERE id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
  }

  const rolesRes = await pool.query(
    `SELECT r.name
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1`,
    [userId]
  );

  const user = result.rows[0];

  return res.json({
    success: true,
    user: {
      id: user.id,
      nama: user.nama,
      no_hp: user.no_hp,
      roles: rolesRes.rows.map((r) => r.name),
      telegram_connected: Boolean(user.telegram_chat_id)
    }
  });
}
