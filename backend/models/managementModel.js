import { pool } from '../db.js';
import { ELIGIBLE_USERS_CLAUSE } from './eligibleUsersSql.js';

export async function ensureUserManagementColumns() {
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`);
}

export async function ensureNotulenTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS monthly_meeting_notes (
      id BIGSERIAL PRIMARY KEY,
      month CHAR(7) NOT NULL,
      notes TEXT NOT NULL,
      created_by UUID,
      updated_by UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (month)
    )
  `);
  await pool.query(`
    ALTER TABLE monthly_meeting_notes
      ADD COLUMN IF NOT EXISTS meeting_date DATE,
      ADD COLUMN IF NOT EXISTS start_time TIME,
      ADD COLUMN IF NOT EXISTS agenda TEXT
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS monthly_meeting_attendance (
      id BIGSERIAL PRIMARY KEY,
      month CHAR(7) NOT NULL,
      warga_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'TIDAK_HADIR' CHECK (status IN ('HADIR','IJIN','TIDAK_HADIR')),
      updated_by UUID,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (month, warga_id)
    )
  `);
  await pool.query(`
    ALTER TABLE monthly_meeting_attendance
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'TIDAK_HADIR'
  `);
  await pool.query(`
    UPDATE monthly_meeting_attendance
    SET status = CASE WHEN hadir = TRUE THEN 'HADIR' ELSE 'TIDAK_HADIR' END
    WHERE status IS NULL
  `).catch(() => {});
}

export async function listAssignableOrganizationRoles() {
  const result = await pool.query(
    `SELECT id, name
     FROM roles
     WHERE LOWER(TRIM(name)) <> 'warga'
       AND LOWER(TRIM(name)) <> 'root'
     ORDER BY id ASC`,
  );
  return result.rows;
}

export async function listUsersWithRoles() {
  await ensureUserManagementColumns();
  const result = await pool.query(
    `SELECT
       u.id,
       u.nama,
       u.no_hp,
       u.last_login_at,
       COALESCE(
         ARRAY_AGG(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL),
         ARRAY[]::text[]
       ) AS roles
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     GROUP BY u.id, u.nama, u.no_hp, u.last_login_at
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

export async function updateWargaUser({ userId, nama, noHp, resetPin = false, defaultPin = '1234' }) {
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

    const duplicate = await client.query(
      `SELECT 1
       FROM users
       WHERE no_hp = $1
         AND id <> $2
       LIMIT 1`,
      [noHp, userId]
    );
    if (duplicate.rows.length > 0) {
      throw new Error('Nomor HP sudah dipakai user lain');
    }

    await client.query(
      `UPDATE users
       SET nama = $2,
           no_hp = $3
       WHERE id = $1`,
      [userId, nama, noHp]
    );

    if (resetPin) {
      await client.query(
        `UPDATE users
         SET pin = $2,
             must_change_pin = TRUE
         WHERE id = $1`,
        [userId, defaultPin]
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

export async function setUserOrganizationRoles({ userId, roleIds }) {
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
       WHERE LOWER(TRIM(name)) <> 'warga'
         AND LOWER(TRIM(name)) <> 'root'`
    );
    const allowedRoleIds = new Set(availableRoles.rows.map((row) => Number(row.id)));

    const normalized = [...new Set((roleIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id)))];
    const invalid = normalized.some((id) => !allowedRoleIds.has(id));
    if (invalid) {
      throw new Error('Ada role admin yang tidak valid');
    }

    const ketuaRole = await client.query(
      `SELECT id FROM roles WHERE LOWER(TRIM(name)) = 'ketua' LIMIT 1`
    );
    const ketuaRoleId = Number(ketuaRole.rows[0]?.id || 0);
    if (ketuaRoleId && normalized.includes(ketuaRoleId)) {
      const existing = await client.query(
        `SELECT ur.user_id
         FROM user_roles ur
         WHERE ur.role_id = $1
           AND ur.user_id <> $2::uuid
         LIMIT 1`,
        [ketuaRoleId, userId]
      );
      if (existing.rows.length > 0) {
        throw new Error('Role Ketua hanya boleh 1 orang. Gunakan role Plt Ketua untuk petugas backup.');
      }
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

export async function getMeetingNoteByMonth(month) {
  await ensureNotulenTable();
  const result = await pool.query(
    `SELECT month, notes, meeting_date, start_time, agenda, created_at, updated_at
     FROM monthly_meeting_notes
     WHERE month = $1
     LIMIT 1`,
    [month]
  );
  return result.rows[0] || null;
}

export async function upsertMeetingNoteByMonth({ month, notes, meetingDate, startTime, agenda, actorId }) {
  await ensureNotulenTable();
  await pool.query(
    `INSERT INTO monthly_meeting_notes (month, notes, meeting_date, start_time, agenda, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $6)
     ON CONFLICT (month)
     DO UPDATE SET
       notes = EXCLUDED.notes,
       meeting_date = EXCLUDED.meeting_date,
       start_time = EXCLUDED.start_time,
       agenda = EXCLUDED.agenda,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [month, notes, meetingDate || null, startTime || null, agenda || null, actorId]
  );
}

export async function getMeetingAttendanceByMonth(month) {
  await ensureNotulenTable();
  const result = await pool.query(
    `WITH peserta AS (
       SELECT DISTINCT u.id, u.nama
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE ${ELIGIBLE_USERS_CLAUSE}
     )
     SELECT
       p.id AS warga_id,
       p.nama,
       COALESCE(a.status, 'TIDAK_HADIR') AS status
     FROM peserta p
     LEFT JOIN monthly_meeting_attendance a
       ON a.warga_id = p.id
      AND a.month = $1
     ORDER BY p.nama ASC`,
    [month]
  );
  return result.rows;
}

export async function upsertMeetingAttendanceByMonth({ month, attendance, actorId }) {
  await ensureNotulenTable();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of attendance) {
      const wargaId = String(item.warga_id || '').trim();
      const status = String(item.status || 'TIDAK_HADIR').trim().toUpperCase();
      if (!wargaId) continue;
      if (!['HADIR', 'IJIN', 'TIDAK_HADIR'].includes(status)) continue;
      await client.query(
        `INSERT INTO monthly_meeting_attendance (month, warga_id, status, updated_by, updated_at)
         VALUES ($1, $2::uuid, $3, $4::uuid, NOW())
         ON CONFLICT (month, warga_id)
         DO UPDATE SET status = EXCLUDED.status, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        [month, wargaId, status, actorId]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
