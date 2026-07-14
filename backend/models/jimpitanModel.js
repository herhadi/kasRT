import { pool } from '../db.js';
import { ELIGIBLE_USERS_CLAUSE } from './eligibleUsersSql.js';

export async function ensureJimpitanShiftDaysTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jimpitan_shift_days (
      id SMALLINT PRIMARY KEY,
      key_name VARCHAR(20) NOT NULL UNIQUE,
      label VARCHAR(30) NOT NULL,
      sort_order SMALLINT NOT NULL UNIQUE
    )
  `);

  await pool.query(`
    INSERT INTO jimpitan_shift_days (id, key_name, label, sort_order)
    VALUES
      (1, 'ahad', 'Ahad', 1),
      (2, 'senin', 'Senin', 2),
      (3, 'selasa', 'Selasa', 3),
      (4, 'rabu', 'Rabu', 4),
      (5, 'kamis', 'Kamis', 5),
      (6, 'jumat', 'Jum''at', 6),
      (7, 'sabtu', 'Sabtu', 7)
    ON CONFLICT (id) DO UPDATE SET
      key_name = EXCLUDED.key_name,
      label = EXCLUDED.label,
      sort_order = EXCLUDED.sort_order
  `);
}

export async function ensureJimpitanReminderLogTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jimpitan_reminder_logs (
      id BIGSERIAL PRIMARY KEY,
      reminder_date DATE NOT NULL,
      reminder_type VARCHAR(40) NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      total_recipients INTEGER NOT NULL DEFAULT 0,
      UNIQUE (reminder_date, reminder_type)
    )
  `);

  await pool.query(`
    ALTER TABLE jimpitan_reminder_logs
      ADD COLUMN IF NOT EXISTS total_target INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS telegram_recipients INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS telegram_sent INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS telegram_failed INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS telegram_errors JSONB NOT NULL DEFAULT '[]'::jsonb
  `);
}

export async function ensureJimpitanRouteOrderTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jimpitan_route_orders (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      operational_date DATE NOT NULL,
      ordered_warga_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, operational_date)
    )
  `);
}

export async function ensureJimpitanExternalParticipantsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jimpitan_external_participants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nama VARCHAR(120) NOT NULL,
      no_hp VARCHAR(30) NULL,
      keterangan TEXT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE jimpitan_details
      ADD COLUMN IF NOT EXISTS external_participant_id UUID NULL
  `);

  await pool.query(`
    ALTER TABLE jimpitan_details
      ALTER COLUMN warga_id DROP NOT NULL
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_jimpitan_details_external_tanggal
    ON jimpitan_details (external_participant_id, tanggal DESC)
  `);

  await pool.query(`
    ALTER TABLE jimpitan_details
      ADD COLUMN IF NOT EXISTS source_mode VARCHAR(20) NOT NULL DEFAULT 'PER_WARGA'
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_jimpitan_details_source_tanggal
    ON jimpitan_details (source_mode, tanggal DESC)
  `);
}

export async function ensureJimpitanTopupsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jimpitan_topups (
      id BIGSERIAL PRIMARY KEY,
      warga_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      nominal NUMERIC(18, 2) NOT NULL CHECK (nominal > 0),
      admin_id UUID REFERENCES users(id),
      note TEXT,
      month_key VARCHAR(7),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE jimpitan_topups ADD COLUMN IF NOT EXISTS month_key VARCHAR(7)`);
  await pool.query(`
    UPDATE jimpitan_topups
    SET month_key = TO_CHAR(created_at, 'YYYY-MM')
    WHERE month_key IS NULL
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS jimpitan_topups_month_idx ON jimpitan_topups (month_key, warga_id)`);
}

export async function ensureJimpitanMembersTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jimpitan_members (
      warga_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'INACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by UUID REFERENCES users(id)
    )
  `);
  await pool.query(`UPDATE jimpitan_members SET status = 'ACTIVE' WHERE status = 'DONATUR'`);
  await pool.query(`ALTER TABLE jimpitan_members ALTER COLUMN status SET DEFAULT 'INACTIVE'`);
  await pool.query(`
    DO $$
    DECLARE constraint_name text;
    BEGIN
      SELECT c.conname INTO constraint_name
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'jimpitan_members'
        AND c.contype = 'c'
        AND pg_get_constraintdef(c.oid) LIKE '%status%';
      IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE jimpitan_members DROP CONSTRAINT ' || quote_ident(constraint_name);
      END IF;
      ALTER TABLE jimpitan_members
        ADD CONSTRAINT jimpitan_members_status_check CHECK (status IN ('ACTIVE','INACTIVE'));
    END $$;
  `);
}

export async function ensureJimpitanModeHistoryTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jimpitan_mode_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      effective_date DATE NOT NULL,
      mode VARCHAR(20) NOT NULL CHECK (mode IN ('PER_WARGA','SHIFT_TOTAL')),
      note TEXT NULL,
      created_by UUID NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE jimpitan_mode_history ADD COLUMN IF NOT EXISTS effective_date DATE`);
  await pool.query(`UPDATE jimpitan_mode_history SET effective_date = '2026-01-01'::date WHERE effective_date IS NULL`);
  await pool.query(`ALTER TABLE jimpitan_mode_history ALTER COLUMN effective_date SET NOT NULL`);
  await pool.query(`ALTER TABLE jimpitan_mode_history DROP COLUMN IF EXISTS effective_month`);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_jimpitan_mode_history_effective_created
    ON jimpitan_mode_history (effective_date DESC, created_at DESC)
  `);

  await pool.query(`
    INSERT INTO jimpitan_mode_history (effective_date, mode, note)
    SELECT '2026-01-01'::date, 'PER_WARGA', 'Default awal sistem'
    WHERE NOT EXISTS (
      SELECT 1 FROM jimpitan_mode_history
    )
  `);
}

export async function ensureJimpitanBatchModeColumns() {
  await pool.query(`
    ALTER TABLE jimpitan_batches
      ADD COLUMN IF NOT EXISTS batch_mode VARCHAR(20) NOT NULL DEFAULT 'PER_WARGA',
      ADD COLUMN IF NOT EXISTS operational_date DATE NULL,
      ADD COLUMN IF NOT EXISTS note TEXT NULL,
      ADD COLUMN IF NOT EXISTS total_rumah INTEGER NOT NULL DEFAULT 0
  `);
}

export async function ensureJimpitanScheduleColumns() {
  await ensureJimpitanShiftDaysTable();
  await ensureJimpitanReminderLogTable();
  await ensureJimpitanRouteOrderTable();
  await ensureJimpitanExternalParticipantsTable();
  await ensureJimpitanMembersTable();
  await ensureJimpitanModeHistoryTable();
  await ensureJimpitanBatchModeColumns();

  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS jimpitan_shift_hari SMALLINT,
      ADD COLUMN IF NOT EXISTS jimpitan_alias VARCHAR(40)
  `);
}

export async function getJimpitanModeHistory() {
  await ensureJimpitanModeHistoryTable();
  const result = await pool.query(
    `SELECT
       jmh.id::text,
       TO_CHAR(jmh.effective_date, 'YYYY-MM-DD') AS effective_date,
       jmh.mode,
       jmh.note,
       jmh.created_at,
       jmh.created_by::text,
       u.nama AS created_by_name
     FROM jimpitan_mode_history jmh
     LEFT JOIN users u ON u.id = jmh.created_by
     ORDER BY jmh.effective_date DESC, jmh.created_at DESC`
  );
  return result.rows;
}

export async function getEffectiveJimpitanMode(referenceDate = null) {
  await ensureJimpitanModeHistoryTable();
  const raw = String(referenceDate || '').trim();
  const targetDate = /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(raw)
    ? raw
    : /^\d{4}-(0[1-9]|1[0-2])$/.test(raw)
      ? `${raw}-01`
      : new Date().toISOString().slice(0, 10);
  const result = await pool.query(
    `SELECT
       jmh.id::text,
       TO_CHAR(jmh.effective_date, 'YYYY-MM-DD') AS effective_date,
       jmh.mode,
       jmh.note,
       jmh.created_at,
       jmh.created_by::text,
       u.nama AS created_by_name
     FROM jimpitan_mode_history jmh
     LEFT JOIN users u ON u.id = jmh.created_by
     WHERE jmh.effective_date <= $1::date
     ORDER BY jmh.effective_date DESC, jmh.created_at DESC
     LIMIT 1`,
    [targetDate]
  );
  return result.rows[0] || { effective_date: '2026-01-01', mode: 'PER_WARGA', note: 'Default awal sistem' };
}

export async function setJimpitanMode({ effectiveDate, mode, note = null, createdBy }) {
  await ensureJimpitanModeHistoryTable();
  const cleanDate = String(effectiveDate || '').trim();
  const cleanMode = String(mode || '').trim().toUpperCase();
  if (!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(cleanDate)) throw new Error('Tanggal berlaku tidak valid');
  if (!['PER_WARGA', 'SHIFT_TOTAL'].includes(cleanMode)) throw new Error('Mode jimpitan tidak valid');

  const result = await pool.query(
    `INSERT INTO jimpitan_mode_history (effective_date, mode, note, created_by, created_at)
     VALUES ($1::date, $2, NULLIF($3, ''), $4::uuid, NOW())
     RETURNING id::text, TO_CHAR(effective_date, 'YYYY-MM-DD') AS effective_date, mode, note, created_by::text, created_at`,
    [cleanDate, cleanMode, note, createdBy]
  );
  return result.rows[0];
}

export async function ensureJimpitanMembersFromEligible() {
  await ensureJimpitanScheduleColumns();
  await pool.query(
    `INSERT INTO jimpitan_members (warga_id, status)
     SELECT u.id, 'INACTIVE'
     FROM users u
     WHERE ${ELIGIBLE_USERS_CLAUSE}
     ON CONFLICT (warga_id) DO NOTHING`
  );
}

export async function listJimpitanMembers() {
  await ensureJimpitanMembersFromEligible();
  const result = await pool.query(
    `SELECT u.id::text AS warga_id, u.nama, u.no_hp, jm.status, jm.updated_at
     FROM jimpitan_members jm
     JOIN users u ON u.id = jm.warga_id
     WHERE ${ELIGIBLE_USERS_CLAUSE}
     ORDER BY
       CASE jm.status WHEN 'ACTIVE' THEN 1 ELSE 2 END,
       u.nama ASC`
  );
  return result.rows.map((row) => ({
    warga_id: String(row.warga_id),
    nama: String(row.nama || ''),
    no_hp: row.no_hp || '',
    status: String(row.status || 'ACTIVE'),
    updated_at: row.updated_at
  }));
}

export async function setJimpitanMemberStatus({ wargaId, status, updatedBy }) {
  await ensureJimpitanMembersFromEligible();
  const nextStatus = String(status || '').trim().toUpperCase();
  if (!['ACTIVE', 'INACTIVE'].includes(nextStatus)) throw new Error('status tidak valid');
  const result = await pool.query(
    `INSERT INTO jimpitan_members (warga_id, status, updated_by, updated_at)
     VALUES ($1::uuid, $2, $3::uuid, NOW())
     ON CONFLICT (warga_id)
     DO UPDATE SET status = EXCLUDED.status, updated_by = EXCLUDED.updated_by, updated_at = NOW()
     RETURNING warga_id::text, status, updated_at`,
    [wargaId, nextStatus, updatedBy]
  );
  return result.rows[0] || null;
}

export async function getUserJimpitanShiftHari(userId) {
  await ensureJimpitanScheduleColumns();
  const result = await pool.query(
    `SELECT jimpitan_shift_hari
     FROM users
     WHERE id = $1`,
    [userId]
  );

  if (result.rows.length === 0) return null;
  const value = result.rows[0].jimpitan_shift_hari;
  return value === null ? null : Number(value);
}

async function getCurrentMonthSaldoByWarga(client, wargaId, referenceDate = null) {
  const refDateParam = referenceDate ? `${referenceDate}` : null;
  const result = await client.query(
    `WITH bulan_ref AS (
       SELECT DATE_TRUNC('month', COALESCE($2::date, CURRENT_DATE)) AS month_start
     ),
     total_detail AS (
       SELECT COALESCE(SUM(jd.nominal), 0) AS total
       FROM jimpitan_details jd
       CROSS JOIN bulan_ref br
       WHERE jd.warga_id = $1
         AND DATE_TRUNC('month', jd.tanggal::date) = br.month_start
     ),
     total_topup AS (
       SELECT COALESCE(SUM(jt.nominal), 0) AS total
       FROM jimpitan_topups jt
       CROSS JOIN bulan_ref br
       WHERE jt.warga_id = $1
         AND jt.month_key = TO_CHAR(br.month_start, 'YYYY-MM')
     )
     SELECT (SELECT total FROM total_detail) + (SELECT total FROM total_topup) AS saldo_bulan_ini`,
    [wargaId, refDateParam]
  );

  return Number(result.rows[0]?.saldo_bulan_ini || 0);
}

export async function createJimpitanDraftAndUpdateSaldo({ wargaId, nominal, tanggal, petugasId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO jimpitan_details (warga_id, nominal, tanggal, petugas_id, status)
       VALUES ($1, $2, $3::date, $4, 'DRAFT')`,
      [wargaId, nominal, tanggal, petugasId]
    );

    await client.query(
      `UPDATE users
       SET jimpitan_saldo = COALESCE(jimpitan_saldo, 0) + $1
       WHERE id = $2`,
      [nominal, wargaId]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createJimpitanExternalDraft({ externalParticipantId, nominal, tanggal, petugasId }) {
  await ensureJimpitanScheduleColumns();
  await pool.query(
    `INSERT INTO jimpitan_details (warga_id, external_participant_id, nominal, tanggal, petugas_id, status)
     VALUES (NULL, $1::uuid, $2, $3::date, $4, 'DRAFT')`,
    [externalParticipantId, nominal, tanggal, petugasId]
  );
}

export async function getJimpitanV2InputStatus(operationalDate, petugasId = null) {
  await ensureJimpitanScheduleColumns();
  const result = await pool.query(
    `SELECT
       EXISTS (
         SELECT 1
         FROM jimpitan_batches jb
         WHERE jb.operational_date = $1::date
           AND jb.batch_mode = 'SHIFT_TOTAL'
           AND jb.status IN ('PENDING','APPROVED')
           AND COALESCE(jb.note, '') NOT LIKE '[ADMIN_MONTHLY]%'
       ) AS has_global,
       EXISTS (
         SELECT 1
         FROM jimpitan_details jd
         WHERE jd.tanggal = $1::date
           AND jd.source_mode = 'SHIFT_TOTAL'
       ) AS has_by_name,
       EXISTS (
         SELECT 1
         FROM jimpitan_batches jb
         WHERE $2::text IS NOT NULL
           AND jb.petugas_id::text = $2::text
           AND jb.operational_date = $1::date
           AND jb.batch_mode = 'SHIFT_TOTAL'
           AND jb.status IN ('PENDING','APPROVED')
           AND COALESCE(jb.note, '') NOT LIKE '[ADMIN_MONTHLY]%'
       ) AS has_my_global`,
    [operationalDate, petugasId]
  );
  const row = result.rows[0] || {};
  const hasGlobal = Boolean(row.has_global);
  const hasByName = Boolean(row.has_by_name);
  return {
    has_global: hasGlobal,
    has_by_name: hasByName,
    has_my_global: Boolean(row.has_my_global),
    input_mode: hasGlobal ? 'GLOBAL' : hasByName ? 'BY_NAME' : null
  };
}

export async function createJimpitanV2Detail({ wargaId = null, externalParticipantId = null, nominal, tanggal, petugasId }) {
  await ensureJimpitanScheduleColumns();
  const total = Number(nominal || 0);
  if (!Number.isFinite(total) || total < 0) throw new Error('Nominal tidak valid');
  if (!wargaId && !externalParticipantId) throw new Error('Target input tidak valid');

  const inputStatus = await getJimpitanV2InputStatus(tanggal);
  if (inputStatus.has_global) {
    throw new Error('Tanggal ini sudah memakai rekap global. Input by name dikunci agar data tidak dobel.');
  }

  await pool.query(
    `INSERT INTO jimpitan_details
       (warga_id, external_participant_id, nominal, tanggal, petugas_id, status, source_mode)
     VALUES ($1::uuid, $2::uuid, $3, $4::date, $5, 'APPROVED', 'SHIFT_TOTAL')`,
    [wargaId, externalParticipantId, total, tanggal, petugasId]
  );
}

export async function createSetorBatch({ petugasId, detailIds = null }) {
  await ensureJimpitanScheduleColumns();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const detailQuery = detailIds && detailIds.length > 0
      ? {
          text: `SELECT id, nominal
                 FROM jimpitan_details
                 WHERE status = 'DRAFT' AND petugas_id = $1 AND id = ANY($2::int[])`,
          values: [petugasId, detailIds]
        }
      : {
          text: `SELECT id, nominal
                 FROM jimpitan_details
                 WHERE status = 'DRAFT' AND petugas_id = $1`,
          values: [petugasId]
        };

    const details = await client.query(detailQuery.text, detailQuery.values);
    if (details.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const total = details.rows.reduce((sum, row) => sum + Number(row.nominal || 0), 0);

    const batchResult = await client.query(
      `INSERT INTO jimpitan_batches (petugas_id, total_amount, status, batch_mode, total_rumah)
       VALUES ($1, $2, 'PENDING', 'PER_WARGA', $3)
       RETURNING id`,
      [petugasId, total, details.rows.length]
    );

    const batchId = batchResult.rows[0].id;

    for (const row of details.rows) {
      await client.query(
        `INSERT INTO jimpitan_batch_items (batch_id, jimpitan_detail_id)
         VALUES ($1, $2)`,
        [batchId, row.id]
      );

      await client.query(
        `UPDATE jimpitan_details
         SET status = 'SUBMITTED'
         WHERE id = $1`,
        [row.id]
      );
    }

    await client.query('COMMIT');
    return {
      batch_id: batchId,
      total,
      total_rumah: details.rows.length
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createShiftTotalBatch({ petugasId, totalAmount, operationalDate, note = null }) {
  await ensureJimpitanScheduleColumns();
  const total = Number(totalAmount || 0);
  if (!Number.isFinite(total) || total <= 0) throw new Error('Nominal setor harus lebih dari 0');

  const inputStatus = await getJimpitanV2InputStatus(operationalDate);
  if (inputStatus.has_by_name) {
    throw new Error('Tanggal ini sudah memakai rekap by name. Input global dikunci agar data tidak dobel.');
  }

  const duplicate = await pool.query(
    `SELECT id, status
     FROM jimpitan_batches
     WHERE petugas_id = $1
       AND operational_date = $2::date
       AND batch_mode = 'SHIFT_TOTAL'
       AND status IN ('PENDING','APPROVED')
     LIMIT 1`,
    [petugasId, operationalDate]
  );
  if (duplicate.rows.length > 0) {
    throw new Error(`Setoran shift tanggal ini sudah ada (${duplicate.rows[0].status})`);
  }

  const result = await pool.query(
    `INSERT INTO jimpitan_batches
       (petugas_id, total_amount, status, batch_mode, operational_date, note, total_rumah)
     VALUES ($1, $2, 'PENDING', 'SHIFT_TOTAL', $3::date, NULLIF($4, ''), 0)
     RETURNING id, total_amount, operational_date, note`,
    [petugasId, total, operationalDate, note]
  );
  return {
    batch_id: result.rows[0].id,
    total: Number(result.rows[0].total_amount || 0),
    operational_date: result.rows[0].operational_date,
    note: result.rows[0].note
  };
}

export async function createApprovedShiftTotalIncome({ adminId, totalAmount, operationalDate, note = null }) {
  await ensureJimpitanScheduleColumns();
  const total = Number(totalAmount || 0);
  if (!Number.isFinite(total) || total <= 0) throw new Error('Nominal pemasukan harus lebih dari 0');

  const duplicate = await pool.query(
    `SELECT id
     FROM jimpitan_batches
     WHERE operational_date = $1::date
       AND batch_mode = 'SHIFT_TOTAL'
       AND status = 'APPROVED'
       AND COALESCE(note, '') LIKE '[ADMIN_INPUT]%'
     LIMIT 1`,
    [operationalDate]
  );
  if (duplicate.rows.length > 0) {
    throw new Error('Pemasukan V2 tanggal ini sudah pernah diinput admin');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const batchResult = await client.query(
      `INSERT INTO jimpitan_batches
         (petugas_id, total_amount, status, batch_mode, operational_date, note, total_rumah, approved_by, approved_at, created_at)
       VALUES ($1, $2, 'APPROVED', 'SHIFT_TOTAL', $3::date, $4, 0, $1, NOW(), $3::date)
       RETURNING id, total_amount, operational_date, note`,
      [adminId, total, operationalDate, `[ADMIN_INPUT] ${note || ''}`.trim()]
    );

    const walletResult = await client.query(`SELECT id FROM wallets WHERE name = 'Kas Jimpitan' LIMIT 1`);
    if (walletResult.rows.length === 0) throw new Error('Wallet Kas Jimpitan tidak ditemukan');

    await client.query(
      `INSERT INTO transactions
       (type, target_wallet_id, amount, status, description, created_by, approved_by, approved_at, created_at)
       VALUES ('IN', $1, $2, 'APPROVED', $3, $4, $4, NOW(), $5::date)`,
      [
        walletResult.rows[0].id,
        total,
        `[JIMPITAN_V2_ADMIN] Pemasukan jimpitan ${operationalDate}${note ? ` • ${note}` : ''}`,
        adminId,
        operationalDate
      ]
    );

    await client.query('COMMIT');
    return {
      batch_id: batchResult.rows[0].id,
      total: Number(batchResult.rows[0].total_amount || 0),
      operational_date: batchResult.rows[0].operational_date
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createApprovedShiftMonthlyIncome({ adminId, totalAmount, monthKey, note = null }) {
  await ensureJimpitanScheduleColumns();
  const total = Number(totalAmount || 0);
  if (!Number.isFinite(total) || total <= 0) throw new Error('Nominal rekap bulanan harus lebih dari 0');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(monthKey || ''))) throw new Error('Periode rekap bulanan tidak valid');
  const operationalDate = `${monthKey}-01`;

  const duplicate = await pool.query(
    `SELECT id
     FROM jimpitan_batches
     WHERE TO_CHAR(operational_date, 'YYYY-MM') = $1
       AND batch_mode = 'SHIFT_TOTAL'
       AND status = 'APPROVED'
       AND COALESCE(note, '') LIKE '[ADMIN_MONTHLY]%'
     LIMIT 1`,
    [monthKey]
  );
  if (duplicate.rows.length > 0) {
    throw new Error('Rekap bulanan V2 periode ini sudah pernah diinput admin');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const batchResult = await client.query(
      `INSERT INTO jimpitan_batches
         (petugas_id, total_amount, status, batch_mode, operational_date, note, total_rumah, approved_by, approved_at, created_at)
       VALUES ($1, $2, 'APPROVED', 'SHIFT_TOTAL', $3::date, $4, 0, $1, NOW(), $3::date)
       RETURNING id, total_amount, operational_date, note`,
      [adminId, total, operationalDate, `[ADMIN_MONTHLY] Rekap bulanan ${monthKey}${note ? ` • ${note}` : ''}`]
    );

    const walletResult = await client.query(`SELECT id FROM wallets WHERE name = 'Kas Jimpitan' LIMIT 1`);
    if (walletResult.rows.length === 0) throw new Error('Wallet Kas Jimpitan tidak ditemukan');

    await client.query(
      `INSERT INTO transactions
       (type, target_wallet_id, amount, status, description, created_by, approved_by, approved_at, created_at)
       VALUES ('IN', $1, $2, 'APPROVED', $3, $4, $4, NOW(), $5::date)`,
      [
        walletResult.rows[0].id,
        total,
        `[JIMPITAN_V2_MONTHLY] Rekap bulanan jimpitan ${monthKey}${note ? ` • ${note}` : ''}`,
        adminId,
        operationalDate
      ]
    );

    await client.query('COMMIT');
    return {
      batch_id: batchResult.rows[0].id,
      total: Number(batchResult.rows[0].total_amount || 0),
      month_key: monthKey
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createJimpitanOldCashHandover({ adminId, amount, handoverDate, note = null }) {
  const total = Number(amount || 0);
  if (!Number.isFinite(total) || total <= 0) throw new Error('Nominal setoran susulan harus lebih dari 0');
  if (!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(String(handoverDate || ''))) throw new Error('Tanggal serah terima tidak valid');

  const duplicate = await pool.query(
    `SELECT id
     FROM transactions
     WHERE type = 'IN'
       AND status = 'APPROVED'
       AND description LIKE $1
     LIMIT 1`,
    [`[JIMPITAN_OLD_CASH_HANDOVER] Setoran susulan kas lama ${handoverDate}%`]
  );
  if (duplicate.rows.length > 0) {
    throw new Error('Setoran susulan kas lama untuk tanggal ini sudah pernah diinput');
  }

  const walletResult = await pool.query(`SELECT id FROM wallets WHERE name = 'Kas Jimpitan' LIMIT 1`);
  if (walletResult.rows.length === 0) throw new Error('Wallet Kas Jimpitan tidak ditemukan');

  const result = await pool.query(
    `INSERT INTO transactions
     (type, target_wallet_id, amount, status, description, created_by, approved_by, approved_at, created_at)
     VALUES ('IN', $1, $2, 'APPROVED', $3, $4, $4, NOW(), $5::date)
     RETURNING id::text, amount, description, created_at`,
    [
      walletResult.rows[0].id,
      total,
      `[JIMPITAN_OLD_CASH_HANDOVER] Setoran susulan kas lama ${handoverDate}${note ? ` • ${note}` : ''}`,
      adminId,
      handoverDate
    ]
  );
  return result.rows[0];
}

export async function approveJimpitanBatch({ batchId, adminId }) {
  await ensureJimpitanScheduleColumns();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const batchResult = await client.query(
      `SELECT total_amount, status, batch_mode, operational_date, note
       FROM jimpitan_batches
       WHERE id = $1`,
      [batchId]
    );

    if (batchResult.rows.length === 0) {
      throw new Error('Batch tidak ditemukan');
    }

    if (batchResult.rows[0].status === 'APPROVED') {
      throw new Error('Batch sudah di-approve');
    }

    const batch = batchResult.rows[0];
    const total = Number(batch.total_amount || 0);
    const batchMode = String(batch.batch_mode || 'PER_WARGA').toUpperCase();

    await client.query(
      `UPDATE jimpitan_batches
       SET status = 'APPROVED', approved_by = $1, approved_at = NOW()
       WHERE id = $2`,
      [adminId, batchId]
    );

    if (batchMode === 'PER_WARGA') {
      await client.query(
        `UPDATE jimpitan_details jd
         SET status = 'APPROVED'
         FROM jimpitan_batch_items jbi
         WHERE jbi.jimpitan_detail_id = jd.id
         AND jbi.batch_id = $1`,
        [batchId]
      );
    }

    const walletResult = await client.query(`SELECT id FROM wallets WHERE name = 'Kas Jimpitan' LIMIT 1`);
    if (walletResult.rows.length === 0) {
      throw new Error('Wallet Kas Jimpitan tidak ditemukan');
    }

    const walletId = walletResult.rows[0].id;

    await client.query(
      `INSERT INTO transactions
       (type, target_wallet_id, amount, status, description, created_by, approved_by, approved_at)
       VALUES ('IN', $1, $2, 'APPROVED', $3, $4, $4, NOW())`,
      [
        walletId,
        total,
        batchMode === 'SHIFT_TOTAL'
          ? `[JIMPITAN_V2] Setoran shift jimpitan ${batch.operational_date ? String(batch.operational_date).slice(0, 10) : ''}`.trim()
          : '[JIMPITAN_V1] Setoran per warga jimpitan',
        adminId
      ]
    );

    await client.query('COMMIT');
    return { total };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listJimpitanV2AdminEntries({ limit = 50 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const result = await pool.query(
    `SELECT
       src.id::text,
       src.entry_type,
       src.entry_date,
       src.amount,
       src.description,
       src.created_at,
       src.created_by::text,
       u.nama AS created_by_name
     FROM (
       SELECT
         jb.id::text AS id,
         CASE WHEN COALESCE(jb.note, '') LIKE '[ADMIN_MONTHLY]%' THEN 'MONTHLY_INCOME' ELSE 'SHIFT_INCOME' END AS entry_type,
         jb.operational_date AS entry_date,
         jb.total_amount AS amount,
         jb.note AS description,
         jb.created_at,
         jb.petugas_id::text AS created_by
       FROM jimpitan_batches jb
       WHERE jb.batch_mode = 'SHIFT_TOTAL'
         AND jb.status = 'APPROVED'
         AND (COALESCE(jb.note, '') LIKE '[ADMIN_INPUT]%' OR COALESCE(jb.note, '') LIKE '[ADMIN_MONTHLY]%')
       UNION ALL
       SELECT
         t.id::text AS id,
         'OLD_CASH_HANDOVER' AS entry_type,
         t.created_at::date AS entry_date,
         t.amount,
         t.description,
         t.created_at,
         t.created_by::text AS created_by
       FROM transactions t
       WHERE t.type = 'IN'
         AND t.status = 'APPROVED'
         AND t.description LIKE '[JIMPITAN_OLD_CASH_HANDOVER]%'
     ) src
     LEFT JOIN users u ON u.id::text = src.created_by::text
     ORDER BY src.entry_date DESC, src.created_at DESC
     LIMIT $1`,
    [safeLimit]
  );
  return result.rows.map((row) => ({
    ...row,
    amount: Number(row.amount || 0)
  }));
}

export async function findBatchCreator(batchId) {
  await ensureJimpitanScheduleColumns();
  const result = await pool.query(
    `SELECT petugas_id, total_amount, batch_mode, operational_date, note FROM jimpitan_batches WHERE id = $1`,
    [batchId]
  );
  return result.rows[0] || null;
}

export async function listWargaTotalsInBatch(batchId) {
  const result = await pool.query(
    `SELECT
       jd.warga_id,
       COALESCE(SUM(jd.nominal), 0) AS total_nominal
     FROM jimpitan_batch_items jbi
     JOIN jimpitan_details jd ON jd.id = jbi.jimpitan_detail_id
     WHERE jbi.batch_id = $1
       AND jd.warga_id IS NOT NULL
     GROUP BY jd.warga_id`,
    [batchId]
  );
  return result.rows;
}

export async function listJimpitanByOperationalDate(operationalDate) {
  await ensureJimpitanMembersFromEligible();
  const wargaResult = await pool.query(
    `WITH daily_nominal AS (
       SELECT
         jd.warga_id,
         COALESCE(SUM(jd.nominal), 0) AS nominal_hari_ini
       FROM jimpitan_details jd
       WHERE jd.tanggal = $1::date
       GROUP BY jd.warga_id
     ),
     daily_petugas AS (
       SELECT DISTINCT ON (jd.warga_id)
         jd.warga_id,
         jd.petugas_id
       FROM jimpitan_details jd
       WHERE jd.tanggal = $1::date
       ORDER BY jd.warga_id, jd.created_at DESC
     ),
     daily_latest_input AS (
       SELECT DISTINCT ON (jd.warga_id)
         jd.warga_id,
         jd.status AS detail_status,
         jb.status AS batch_status
       FROM jimpitan_details jd
       LEFT JOIN jimpitan_batch_items jbi ON jbi.jimpitan_detail_id = jd.id
       LEFT JOIN jimpitan_batches jb ON jb.id = jbi.batch_id
       WHERE jd.tanggal = $1::date
       ORDER BY jd.warga_id, jd.created_at DESC
     ),
     monthly_detail AS (
       SELECT
         jd.warga_id,
         COALESCE(SUM(jd.nominal), 0) AS total_detail_bulan_ini
       FROM jimpitan_details jd
       WHERE DATE_TRUNC('month', jd.tanggal::date) = DATE_TRUNC('month', $1::date)
       GROUP BY jd.warga_id
     ),
     monthly_topup AS (
       SELECT
         jt.warga_id,
         COALESCE(SUM(jt.nominal), 0) AS total_topup_bulan_ini
       FROM jimpitan_topups jt
       WHERE jt.month_key = TO_CHAR($1::date, 'YYYY-MM')
       GROUP BY jt.warga_id
     )
     SELECT
       u.id,
       u.nama,
       COALESCE(md.total_detail_bulan_ini, 0) + COALESCE(mt.total_topup_bulan_ini, 0) AS saldo,
       COALESCE(dn.nominal_hari_ini, 0) AS nominal_hari_ini,
       p.nama AS petugas,
       dli.detail_status,
       dli.batch_status,
       jm.status AS jimpitan_member_status
     FROM users u
     JOIN jimpitan_members jm ON jm.warga_id = u.id
     LEFT JOIN daily_nominal dn ON dn.warga_id = u.id
     LEFT JOIN daily_petugas dp ON dp.warga_id = u.id
     LEFT JOIN daily_latest_input dli ON dli.warga_id = u.id
     LEFT JOIN monthly_detail md ON md.warga_id = u.id
     LEFT JOIN monthly_topup mt ON mt.warga_id = u.id
     LEFT JOIN users p ON p.id::text = dp.petugas_id::text
     WHERE ${ELIGIBLE_USERS_CLAUSE}
       AND jm.status = 'ACTIVE'
     ORDER BY u.nama ASC`,
    [operationalDate]
  );
  const externalResult = await pool.query(
    `WITH daily_nominal AS (
       SELECT
         jd.external_participant_id,
         COALESCE(SUM(jd.nominal), 0) AS nominal_hari_ini
       FROM jimpitan_details jd
       WHERE jd.tanggal = $1::date
         AND jd.external_participant_id IS NOT NULL
       GROUP BY jd.external_participant_id
     ),
     daily_petugas AS (
       SELECT DISTINCT ON (jd.external_participant_id)
         jd.external_participant_id,
         jd.petugas_id
       FROM jimpitan_details jd
       WHERE jd.tanggal = $1::date
         AND jd.external_participant_id IS NOT NULL
       ORDER BY jd.external_participant_id, jd.created_at DESC
     ),
     daily_latest_input AS (
       SELECT DISTINCT ON (jd.external_participant_id)
         jd.external_participant_id,
         jd.status AS detail_status,
         jb.status AS batch_status
       FROM jimpitan_details jd
       LEFT JOIN jimpitan_batch_items jbi ON jbi.jimpitan_detail_id = jd.id
       LEFT JOIN jimpitan_batches jb ON jb.id = jbi.batch_id
       WHERE jd.tanggal = $1::date
         AND jd.external_participant_id IS NOT NULL
       ORDER BY jd.external_participant_id, jd.created_at DESC
     ),
     monthly_detail AS (
       SELECT
         jd.external_participant_id,
         COALESCE(SUM(jd.nominal), 0) AS total_detail_bulan_ini
       FROM jimpitan_details jd
       WHERE DATE_TRUNC('month', jd.tanggal::date) = DATE_TRUNC('month', $1::date)
         AND jd.external_participant_id IS NOT NULL
       GROUP BY jd.external_participant_id
     )
     SELECT
       CONCAT('DONATUR:', ep.id::text) AS id,
       ep.id::text AS external_participant_id,
       ep.nama,
       'DONATUR' AS target_type,
       COALESCE(md.total_detail_bulan_ini, 0) AS saldo,
       COALESCE(dn.nominal_hari_ini, 0) AS nominal_hari_ini,
       p.nama AS petugas,
       dli.detail_status,
       dli.batch_status
     FROM jimpitan_external_participants ep
     LEFT JOIN daily_nominal dn ON dn.external_participant_id = ep.id
     LEFT JOIN daily_petugas dp ON dp.external_participant_id = ep.id
     LEFT JOIN daily_latest_input dli ON dli.external_participant_id = ep.id
     LEFT JOIN monthly_detail md ON md.external_participant_id = ep.id
     LEFT JOIN users p ON p.id::text = dp.petugas_id::text
     WHERE ep.is_active = TRUE
     ORDER BY ep.nama ASC`,
    [operationalDate]
  );
  return [
    ...wargaResult.rows.map((row) => ({ ...row, target_type: 'WARGA' })),
    ...externalResult.rows
  ];
}

export async function listJimpitanExternalParticipants() {
  await ensureJimpitanScheduleColumns();
  const result = await pool.query(
    `SELECT id::text, nama, no_hp, keterangan, is_active, created_at, updated_at
     FROM jimpitan_external_participants
     ORDER BY is_active DESC, nama ASC`
  );
  return result.rows;
}

export async function createJimpitanExternalParticipant({ nama, noHp = null, keterangan = null }) {
  await ensureJimpitanScheduleColumns();
  const result = await pool.query(
    `INSERT INTO jimpitan_external_participants (nama, no_hp, keterangan)
     VALUES ($1, $2, $3)
     RETURNING id::text, nama, no_hp, keterangan, is_active`,
    [nama, noHp, keterangan]
  );
  return result.rows[0];
}

export async function setJimpitanExternalParticipantActive({ id, isActive }) {
  await ensureJimpitanScheduleColumns();
  const result = await pool.query(
    `UPDATE jimpitan_external_participants
     SET is_active = $2, updated_at = NOW()
     WHERE id = $1::uuid
     RETURNING id::text, nama, no_hp, keterangan, is_active`,
    [id, isActive]
  );
  return result.rows[0] || null;
}

export async function listJimpitanWeeklySchedule() {
  await ensureJimpitanScheduleColumns();

  const shiftDaysResult = await pool.query(
    `SELECT id, key_name, label, sort_order
     FROM jimpitan_shift_days
     ORDER BY sort_order ASC`
  );

  const petugasResult = await pool.query(
    `SELECT
       u.id::text AS id,
       u.nama,
       u.jimpitan_alias,
       COALESCE(NULLIF(TRIM(u.jimpitan_alias), ''), SPLIT_PART(TRIM(u.nama), ' ', 1), u.nama) AS jimpitan_label,
       u.jimpitan_shift_hari
     FROM users u
     WHERE ${ELIGIBLE_USERS_CLAUSE}
     ORDER BY u.nama ASC`
  );

  return {
    shift_days: shiftDaysResult.rows,
    petugas: petugasResult.rows
  };
}

export async function isValidJimpitanShiftDay(shiftHari) {
  await ensureJimpitanScheduleColumns();
  const result = await pool.query(
    `SELECT 1
     FROM jimpitan_shift_days
     WHERE id = $1
     LIMIT 1`,
    [shiftHari]
  );
  return result.rows.length > 0;
}

export async function listPetugasByShiftDay(shiftHari) {
  await ensureJimpitanScheduleColumns();
  const result = await pool.query(
     `SELECT
       u.id::text AS id,
       u.nama,
       u.jimpitan_alias,
       COALESCE(NULLIF(TRIM(u.jimpitan_alias), ''), SPLIT_PART(TRIM(u.nama), ' ', 1), u.nama) AS jimpitan_label,
       u.telegram_chat_id,
       u.no_hp
     FROM users u
     WHERE u.jimpitan_shift_hari = $1
       AND ${ELIGIBLE_USERS_CLAUSE}
     ORDER BY u.nama ASC`,
    [shiftHari]
  );
  return result.rows;
}

export async function lockDailyJimpitanReminder(reminderDate, reminderType, totalRecipients) {
  await ensureJimpitanScheduleColumns();
  const result = await pool.query(
    `INSERT INTO jimpitan_reminder_logs (reminder_date, reminder_type, total_recipients)
     VALUES ($1::date, $2, $3)
     ON CONFLICT (reminder_date, reminder_type) DO NOTHING
     RETURNING id::text`,
    [reminderDate, reminderType, totalRecipients]
  );
  return result.rows[0] || null;
}

export async function updateJimpitanReminderDeliveryLog({
  id,
  totalTarget,
  totalRecipients,
  telegramRecipients,
  telegramSent,
  telegramFailed,
  telegramErrors
}) {
  await ensureJimpitanReminderLogTable();
  const result = await pool.query(
    `UPDATE jimpitan_reminder_logs
     SET total_target = $2,
         total_recipients = $3,
         telegram_recipients = $4,
         telegram_sent = $5,
         telegram_failed = $6,
         telegram_errors = $7::jsonb
     WHERE id = $1
     RETURNING id::text`,
    [
      id,
      totalTarget,
      totalRecipients,
      telegramRecipients,
      telegramSent,
      telegramFailed,
      JSON.stringify(telegramErrors || [])
    ]
  );
  return result.rows[0] || null;
}

export async function listLatestJimpitanReminderLogs(limit = 20) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const result = await pool.query(
    `SELECT
       id::text,
       reminder_date,
       reminder_type,
       sent_at,
       total_target,
       total_recipients,
       telegram_recipients,
       telegram_sent,
       telegram_failed,
       telegram_errors
     FROM jimpitan_reminder_logs
     ORDER BY sent_at DESC
     LIMIT $1`,
    [safeLimit]
  );
  return result.rows;
}

export async function updatePetugasShiftHari({ userId, shiftHari, alias = null }) {
  await ensureJimpitanScheduleColumns();

  const result = await pool.query(
    `UPDATE users
     SET jimpitan_shift_hari = $1,
         jimpitan_alias = NULLIF(TRIM($3), '')
     WHERE id = $2
     RETURNING
       id::text AS id,
       nama,
       jimpitan_alias,
       COALESCE(NULLIF(TRIM(jimpitan_alias), ''), SPLIT_PART(TRIM(nama), ' ', 1), nama) AS jimpitan_label,
       jimpitan_shift_hari`,
    [shiftHari, userId, alias]
  );

  return result.rows[0] || null;
}

export async function getJimpitanRouteOrder({ userId, operationalDate }) {
  await ensureJimpitanScheduleColumns();
  const result = await pool.query(
    `SELECT ordered_warga_ids
     FROM jimpitan_route_orders
     WHERE user_id = $1
       AND operational_date = $2::date
     LIMIT 1`,
    [userId, operationalDate]
  );
  const raw = result.rows[0]?.ordered_warga_ids;
  if (!Array.isArray(raw)) return [];
  return raw.map((id) => String(id)).filter(Boolean);
}

export async function saveJimpitanRouteOrder({ userId, operationalDate, orderedWargaIds }) {
  await ensureJimpitanScheduleColumns();
  await pool.query(
    `INSERT INTO jimpitan_route_orders (user_id, operational_date, ordered_warga_ids, updated_at)
     VALUES ($1, $2::date, $3::jsonb, NOW())
     ON CONFLICT (user_id, operational_date)
     DO UPDATE SET
       ordered_warga_ids = EXCLUDED.ordered_warga_ids,
       updated_at = NOW()`,
    [userId, operationalDate, JSON.stringify(orderedWargaIds || [])]
  );
}

export async function topUpJimpitanSaldo({ wargaId, nominal, monthKey, adminId, note = null }) {
  await ensureJimpitanTopupsTable();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userCheck = await client.query('SELECT id, nama FROM users WHERE id = $1', [wargaId]);
    if (userCheck.rows.length === 0) {
      throw new Error('Warga tidak ditemukan');
    }

    await client.query(
      `UPDATE users
       SET jimpitan_saldo = COALESCE(jimpitan_saldo, 0) + $1
       WHERE id = $2
       RETURNING jimpitan_saldo`,
      [nominal, wargaId]
    );

    await client.query(
      `INSERT INTO jimpitan_topups (warga_id, nominal, month_key, admin_id, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [wargaId, nominal, monthKey, adminId, note]
    );

    const saldoBulanIni = await getCurrentMonthSaldoByWarga(client, wargaId, `${monthKey}-01`);

    await client.query('COMMIT');
    return saldoBulanIni;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listJimpitanTopups({ monthKey, limit = 100 } = {}) {
  await ensureJimpitanTopupsTable();
  const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(monthKey || '')) ? String(monthKey) : new Date().toISOString().slice(0, 7);
  const safeLimit = Math.min(Math.max(Number(limit || 100), 1), 500);
  const result = await pool.query(
    `SELECT
       jt.id::text AS id,
       jt.warga_id::text AS warga_id,
       u.nama,
       jt.month_key,
       jt.nominal,
       jt.note,
       jt.created_at,
       au.nama AS admin_name
     FROM jimpitan_topups jt
     JOIN users u ON u.id = jt.warga_id
     LEFT JOIN users au ON au.id = jt.admin_id
     WHERE jt.month_key = $1
     ORDER BY jt.created_at DESC
     LIMIT $2`,
    [validMonth, safeLimit]
  );
  return result.rows;
}

export async function editNominalJimpitanByAdmin({ wargaId, nominalBaru, tanggalOperasional }) {
  await ensureJimpitanTopupsTable();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const detailResult = await client.query(
      `SELECT
         jd.id,
         jd.warga_id,
         jd.nominal,
         jd.status,
         jbi.batch_id,
         jb.status AS batch_status
       FROM jimpitan_details jd
       LEFT JOIN jimpitan_batch_items jbi ON jbi.jimpitan_detail_id = jd.id
       LEFT JOIN jimpitan_batches jb ON jb.id = jbi.batch_id
       WHERE jd.warga_id = $1
         AND jd.tanggal = $2::date
       ORDER BY jd.created_at DESC
       LIMIT 1
       FOR UPDATE OF jd`,
      [wargaId, tanggalOperasional]
    );

    if (detailResult.rows.length === 0) {
      throw new Error('Data jimpitan warga pada tanggal operasional tidak ditemukan');
    }

    const detail = detailResult.rows[0];
    const status = String(detail.status || '').toUpperCase();
    const batchStatus = String(detail.batch_status || '').toUpperCase();

    if (status === 'APPROVED' || batchStatus === 'APPROVED') {
      throw new Error('Nominal tidak bisa diubah karena sudah APPROVED');
    }

    const nominalLama = Number(detail.nominal || 0);
    const delta = nominalBaru - nominalLama;

    await client.query(
      `UPDATE jimpitan_details
       SET nominal = $1
       WHERE id = $2`,
      [nominalBaru, detail.id]
    );

    await client.query(
      `UPDATE users
       SET jimpitan_saldo = COALESCE(jimpitan_saldo, 0) + $1
       WHERE id = $2
       RETURNING jimpitan_saldo`,
      [delta, detail.warga_id]
    );

    if (detail.batch_id && batchStatus === 'PENDING') {
      await client.query(
        `UPDATE jimpitan_batches
         SET total_amount = COALESCE(total_amount, 0) + $1
         WHERE id = $2`,
        [delta, detail.batch_id]
      );
    }

    const saldoBulanIni = await getCurrentMonthSaldoByWarga(client, detail.warga_id, tanggalOperasional);

    await client.query('COMMIT');
    return {
      detail_id: detail.id,
      nominal_lama: nominalLama,
      nominal_baru: nominalBaru,
      delta,
      saldo_akhir: saldoBulanIni,
      batch_id: detail.batch_id || null
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function resetBulananJimpitanSaldo(_targetBulanan) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Saldo jimpitan dihitung per bulan dari transaksi/topup bulan berjalan.
    // Nilai kolom users.jimpitan_saldo dinolkan untuk menjaga konsistensi data lama.
    await client.query(`UPDATE users SET jimpitan_saldo = 0`);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getApprovedBatchRecapByMonth(period) {
  const result = await pool.query(
    `SELECT
       COUNT(*) AS total_batch,
       COALESCE(SUM(total_amount), 0) AS total_nominal
     FROM jimpitan_batches
     WHERE status = 'APPROVED'
       AND approved_at IS NOT NULL
       AND TO_CHAR(approved_at, 'YYYY-MM') = $1`,
    [period]
  );

  return {
    totalBatch: Number(result.rows[0]?.total_batch || 0),
    totalNominal: Number(result.rows[0]?.total_nominal || 0)
  };
}

export async function getDashboardAdminJimpitan() {
  const todayResult = await pool.query(
    `SELECT COALESCE(SUM(total_amount), 0) AS total
     FROM jimpitan_batches
     WHERE status = 'APPROVED'
       AND approved_at IS NOT NULL
       AND approved_at::date = CURRENT_DATE`
  );

  const monthResult = await pool.query(
    `SELECT
       COALESCE(SUM(total_amount), 0) AS total_bulan_ini,
       COUNT(*) FILTER (WHERE status = 'APPROVED') AS total_batch_approved,
       COUNT(*) FILTER (WHERE status = 'PENDING') AS total_batch_pending
     FROM jimpitan_batches
     WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)`
  );

  const lastMonthResult = await pool.query(
    `SELECT COALESCE(SUM(total_amount), 0) AS total_bulan_lalu
     FROM jimpitan_batches
     WHERE status = 'APPROVED'
       AND DATE_TRUNC('month', approved_at) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')`
  );

  return {
    pemasukan_harian: Number(todayResult.rows[0]?.total || 0),
    pemasukan_bulanan: Number(monthResult.rows[0]?.total_bulan_ini || 0),
    total_batch_approved: Number(monthResult.rows[0]?.total_batch_approved || 0),
    total_batch_pending: Number(monthResult.rows[0]?.total_batch_pending || 0),
    rekap_bulan_lalu: Number(lastMonthResult.rows[0]?.total_bulan_lalu || 0)
  };
}

export async function getJimpitanDailyRecapByMonth(month) {
  const formatDateOnly = (value) => {
    if (!value) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
  };
  const result = await pool.query(
    `SELECT
       tanggal,
       COALESCE(SUM(total_nominal), 0) AS total_nominal,
       COALESCE(SUM(total_rumah), 0) AS total_rumah,
       COALESCE(SUM(total_petugas), 0) AS total_petugas
     FROM (
       SELECT
         jd.tanggal::date AS tanggal,
         COALESCE(SUM(jd.nominal), 0) AS total_nominal,
         COUNT(DISTINCT jd.warga_id) AS total_rumah,
         COUNT(DISTINCT jd.petugas_id) AS total_petugas
       FROM jimpitan_details jd
       WHERE TO_CHAR(jd.tanggal::date, 'YYYY-MM') = $1
       GROUP BY jd.tanggal::date
       UNION ALL
       SELECT
         jb.operational_date::date AS tanggal,
         COALESCE(SUM(jb.total_amount), 0) AS total_nominal,
         0 AS total_rumah,
         COUNT(DISTINCT jb.petugas_id) AS total_petugas
       FROM jimpitan_batches jb
       WHERE TO_CHAR(jb.operational_date::date, 'YYYY-MM') = $1
         AND jb.batch_mode = 'SHIFT_TOTAL'
         AND jb.status = 'APPROVED'
         AND COALESCE(jb.note, '') NOT LIKE '[ADMIN_MONTHLY]%'
       GROUP BY jb.operational_date::date
     ) x
     GROUP BY tanggal
     ORDER BY tanggal ASC`,
    [month]
  );

  const byPetugas = await pool.query(
    `SELECT
       tanggal,
       petugas_nama,
       COALESCE(SUM(total_nominal), 0) AS total_nominal,
       COALESCE(SUM(total_pending), 0) AS total_pending
       FROM (
       SELECT
         jd.tanggal::date AS tanggal,
         COALESCE(NULLIF(TRIM(u.jimpitan_alias), ''), SPLIT_PART(TRIM(u.nama), ' ', 1), u.nama, '-') AS petugas_nama,
         COALESCE(SUM(jd.nominal), 0) AS total_nominal,
         0 AS total_pending
       FROM jimpitan_details jd
       LEFT JOIN users u ON u.id::text = jd.petugas_id::text
       WHERE TO_CHAR(jd.tanggal::date, 'YYYY-MM') = $1
       GROUP BY jd.tanggal::date, COALESCE(NULLIF(TRIM(u.jimpitan_alias), ''), SPLIT_PART(TRIM(u.nama), ' ', 1), u.nama, '-')
       UNION ALL
       SELECT
         jb.operational_date::date AS tanggal,
         COALESCE(NULLIF(TRIM(u.jimpitan_alias), ''), SPLIT_PART(TRIM(u.nama), ' ', 1), u.nama, '-') AS petugas_nama,
         COALESCE(SUM(jb.total_amount), 0) AS total_nominal,
         COALESCE(SUM(CASE WHEN jb.status <> 'APPROVED' THEN jb.total_amount ELSE 0 END), 0) AS total_pending
       FROM jimpitan_batches jb
       LEFT JOIN users u ON u.id::text = jb.petugas_id::text
       WHERE TO_CHAR(jb.operational_date::date, 'YYYY-MM') = $1
         AND jb.batch_mode = 'SHIFT_TOTAL'
         AND jb.status IN ('PENDING','APPROVED')
         AND COALESCE(jb.note, '') NOT LIKE '[ADMIN_MONTHLY]%'
       GROUP BY jb.operational_date::date, COALESCE(NULLIF(TRIM(u.jimpitan_alias), ''), SPLIT_PART(TRIM(u.nama), ' ', 1), u.nama, '-')
     ) x
     GROUP BY tanggal, petugas_nama
     ORDER BY tanggal ASC, petugas_nama ASC`,
    [month]
  );

  return {
    days: result.rows.map((r) => ({
      tanggal: formatDateOnly(r.tanggal),
      total_nominal: Number(r.total_nominal || 0),
      total_rumah: Number(r.total_rumah || 0),
      total_petugas: Number(r.total_petugas || 0)
    })),
    by_petugas: byPetugas.rows.map((r) => ({
      tanggal: formatDateOnly(r.tanggal),
      petugas_nama: String(r.petugas_nama || '-'),
      total_nominal: Number(r.total_nominal || 0),
      total_pending: Number(r.total_pending || 0),
      has_pending: Number(r.total_pending || 0) > 0
    }))
  };
}
