import { pool } from '../db.js';

export async function findUserForLogin(noHp) {
  const result = await pool.query(
    'SELECT id, nama, pin, telegram_chat_id FROM users WHERE no_hp = $1',
    [noHp]
  );
  return result.rows[0] || null;
}

export async function findUserById(userId) {
  const result = await pool.query(
    `SELECT id, nama, no_hp, telegram_chat_id
     FROM users
     WHERE id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

export async function findUserRoles(userId) {
  const result = await pool.query(
    `SELECT r.name
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1`,
    [userId]
  );
  return result.rows.map((row) => row.name);
}
