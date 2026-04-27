import { pool } from '../db.js';

const ASSIGNABLE_ADMIN_ROLE_NAMES = [
  'Admin Jimpitan',
  'Admin Pembangunan',
  'Admin Lingkungan',
  'Admin Sosial',
  'Admin Internet',
  'Admin Koperasi',
  'Admin Keamanan'
];

export async function listAssignableAdminRoles() {
  const result = await pool.query(
    `SELECT id, name
     FROM roles
     WHERE name = ANY($1::text[])
     ORDER BY id ASC`,
    [ASSIGNABLE_ADMIN_ROLE_NAMES]
  );
  return result.rows;
}

export async function listUsersWithRoles() {
  const result = await pool.query(
    `SELECT
       u.id,
       u.nama,
       u.no_hp,
       COALESCE(
         ARRAY_AGG(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL),
         ARRAY[]::text[]
       ) AS roles
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     GROUP BY u.id, u.nama, u.no_hp
     ORDER BY u.nama ASC`
  );
  return result.rows;
}

async function getWargaRoleId(client) {
  let result = await client.query(
    `SELECT id
     FROM roles
     WHERE id = 11
       AND LOWER(name) = 'warga'
     LIMIT 1`
  );
  if (result.rows.length > 0) return result.rows[0].id;

  result = await client.query(
    `SELECT id
     FROM roles
     WHERE LOWER(name) = 'warga'
     LIMIT 1`
  );
  if (result.rows.length > 0) return result.rows[0].id;

  throw new Error('Role Warga tidak ditemukan. Pastikan role id 11 tersedia.');
}

export async function createWargaUser({ nama, noHp, pin }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const duplicate = await client.query(
      `SELECT 1
       FROM users
       WHERE no_hp = $1
       LIMIT 1`,
      [noHp]
    );
    if (duplicate.rows.length > 0) {
      throw new Error('Nomor HP sudah terdaftar');
    }

    const userResult = await client.query(
      `INSERT INTO users (nama, no_hp, pin)
       VALUES ($1, $2, $3)
       RETURNING id, nama, no_hp`,
      [nama, noHp, pin]
    );

    const wargaRoleId = await getWargaRoleId(client);
    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [userResult.rows[0].id, wargaRoleId]
    );

    await client.query('COMMIT');
    return userResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function setUserAdminRoles({ userId, roleIds }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userCheck = await client.query(
      `SELECT id
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [userId]
    );
    if (userCheck.rows.length === 0) {
      throw new Error('User tidak ditemukan');
    }

    const availableRoles = await client.query(
      `SELECT id
       FROM roles
       WHERE name = ANY($1::text[])`,
      [ASSIGNABLE_ADMIN_ROLE_NAMES]
    );
    const allowedRoleIds = new Set(availableRoles.rows.map((row) => Number(row.id)));

    const normalized = [...new Set((roleIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id)))];
    const invalid = normalized.some((id) => !allowedRoleIds.has(id));
    if (invalid) {
      throw new Error('Ada role admin yang tidak valid');
    }

    await client.query(
      `DELETE FROM user_roles
       WHERE user_id = $1
         AND role_id = ANY($2::int[])`,
      [userId, Array.from(allowedRoleIds)]
    );

    if (normalized.length > 0) {
      await client.query(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT $1, UNNEST($2::int[])
         ON CONFLICT DO NOTHING`,
        [userId, normalized]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
