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

export async function listWargaDropdownOptions() {
  const wargaResult = await pool.query(
    `SELECT DISTINCT u.id, u.nama, u.no_hp
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE LOWER(TRIM(r.name)) = 'warga'
     ORDER BY u.nama ASC`
  );

  if (wargaResult.rows.length > 0) {
    return wargaResult.rows;
  }

  const fallbackResult = await pool.query(
    `SELECT u.id, u.nama, u.no_hp
     FROM users u
     WHERE NOT EXISTS (
       SELECT 1
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = u.id
         AND LOWER(TRIM(r.name)) = 'root'
     )
     ORDER BY u.nama ASC`
  );

  return fallbackResult.rows;
}
