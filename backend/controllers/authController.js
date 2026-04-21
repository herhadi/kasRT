import { pool } from '../db.js';
import jwt from 'jsonwebtoken';

export async function login(req, res) {
  const { no_hp, pin } = req.body;

  const result = await pool.query(
    'SELECT id, nama, pin FROM users WHERE no_hp = $1',
    [no_hp]
  );

  if (result.rows.length === 0) {
    return res.json({ success: false, message: 'User tidak ditemukan' });
  }

  const user = result.rows[0];

  if (user.pin !== pin) {
    return res.json({ success: false, message: 'PIN salah' });
  }

  // ambil roles (MULTI ROLE)
  const rolesRes = await pool.query(`
    SELECT r.name 
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = $1
  `, [user.id]);

  const roles = rolesRes.rows.map(r => r.name);

  // generate JWT
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
      roles
    }
  });
}