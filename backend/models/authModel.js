import { pool } from '../db.js';
import { ELIGIBLE_USERS_CLAUSE } from './eligibleUsersSql.js';

export async function findUserForLogin(noHp) {
  const result = await pool.query(
    'SELECT id, nama, no_hp, pin, telegram_chat_id FROM users WHERE no_hp = $1',
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
  const result = await pool.query(
    `SELECT u.id, u.nama, u.no_hp
     FROM users u
     WHERE ${ELIGIBLE_USERS_CLAUSE}
     ORDER BY u.nama ASC`
  );
  return result.rows;
}

export async function updateUserPinById(userId, pin) {
  const result = await pool.query(
    `UPDATE users
     SET pin = $2
     WHERE id = $1
     RETURNING id`,
    [userId, pin]
  );
  return result.rows[0] || null;
}

export async function updateUserProfileById(userId, payload) {
  const fields = [];
  const values = [userId];
  let idx = 2;

  if (typeof payload.nama === 'string' && payload.nama.trim()) {
    fields.push(`nama = $${idx}`);
    values.push(payload.nama.trim());
    idx += 1;
  }
  if (typeof payload.no_hp === 'string' && payload.no_hp.trim()) {
    fields.push(`no_hp = $${idx}`);
    values.push(payload.no_hp.trim());
    idx += 1;
  }
  if (fields.length === 0) return null;

  const result = await pool.query(
    `UPDATE users
     SET ${fields.join(', ')}
     WHERE id = $1
     RETURNING id, nama, no_hp, telegram_chat_id`,
    values
  );

  return result.rows[0] || null;
}
