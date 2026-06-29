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
}

export async function ensureJimpitanScheduleColumns() {
  await ensureJimpitanShiftDaysTable();
  await ensureJimpitanReminderLogTable();
  await ensureJimpitanRouteOrderTable();
  await ensureJimpitanExternalParticipantsTable();

  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS jimpitan_shift_hari SMALLINT
  `);
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
         AND DATE_TRUNC('month', jt.created_at::date) = br.month_start
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

export async function createSetorBatch({ petugasId, detailIds = null }) {
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
      `INSERT INTO jimpitan_batches (petugas_id, total_amount, status)
       VALUES ($1, $2, 'PENDING')
       RETURNING id`,
      [petugasId, total]
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

export async function approveJimpitanBatch({ batchId, adminId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const batchResult = await client.query(
      `SELECT total_amount, status
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

    const total = Number(batchResult.rows[0].total_amount || 0);

    await client.query(
      `UPDATE jimpitan_batches
       SET status = 'APPROVED', approved_by = $1, approved_at = NOW()
       WHERE id = $2`,
      [adminId, batchId]
    );

    await client.query(
      `UPDATE jimpitan_details jd
       SET status = 'APPROVED'
       FROM jimpitan_batch_items jbi
       WHERE jbi.jimpitan_detail_id = jd.id
       AND jbi.batch_id = $1`,
      [batchId]
    );

    const walletResult = await client.query(`SELECT id FROM wallets WHERE name = 'Kas Jimpitan' LIMIT 1`);
    if (walletResult.rows.length === 0) {
      throw new Error('Wallet Kas Jimpitan tidak ditemukan');
    }

    const walletId = walletResult.rows[0].id;

    await client.query(
      `INSERT INTO transactions
       (type, target_wallet_id, amount, status, created_by, approved_by, approved_at)
       VALUES ('IN', $1, $2, 'APPROVED', $3, $3, NOW())`,
      [walletId, total, adminId]
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

export async function findBatchCreator(batchId) {
  const result = await pool.query(
    `SELECT petugas_id, total_amount FROM jimpitan_batches WHERE id = $1`,
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
  await ensureJimpitanScheduleColumns();
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
       WHERE DATE_TRUNC('month', jt.created_at::date) = DATE_TRUNC('month', $1::date)
       GROUP BY jt.warga_id
     )
     SELECT
       u.id,
       u.nama,
       COALESCE(md.total_detail_bulan_ini, 0) + COALESCE(mt.total_topup_bulan_ini, 0) AS saldo,
       COALESCE(dn.nominal_hari_ini, 0) AS nominal_hari_ini,
       p.nama AS petugas,
       dli.detail_status,
       dli.batch_status
     FROM users u
     LEFT JOIN daily_nominal dn ON dn.warga_id = u.id
     LEFT JOIN daily_petugas dp ON dp.warga_id = u.id
     LEFT JOIN daily_latest_input dli ON dli.warga_id = u.id
     LEFT JOIN monthly_detail md ON md.warga_id = u.id
     LEFT JOIN monthly_topup mt ON mt.warga_id = u.id
     LEFT JOIN users p ON p.id::text = dp.petugas_id::text
     WHERE ${ELIGIBLE_USERS_CLAUSE}
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
  return [...wargaResult.rows.map((row) => ({ ...row, target_type: 'WARGA' })), ...externalResult.rows];
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
       u.id,
       u.nama,
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
       u.id,
       u.nama,
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
     RETURNING id`,
    [reminderDate, reminderType, totalRecipients]
  );
  return result.rows.length > 0;
}

export async function listLatestJimpitanReminderLogs(limit = 20) {
  await ensureJimpitanReminderLogTable();
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const result = await pool.query(
    `SELECT
       id::text,
       reminder_date,
       reminder_type,
       sent_at,
       total_recipients
     FROM jimpitan_reminder_logs
     ORDER BY sent_at DESC
     LIMIT $1`,
    [safeLimit]
  );
  return result.rows;
}

export async function updatePetugasShiftHari({ userId, shiftHari }) {
  await ensureJimpitanScheduleColumns();

  const result = await pool.query(
    `UPDATE users
     SET jimpitan_shift_hari = $1
     WHERE id = $2
     RETURNING id, nama, jimpitan_shift_hari`,
    [shiftHari, userId]
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

export async function topUpJimpitanSaldo({ wargaId, nominal, adminId, note = null }) {
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
      `INSERT INTO jimpitan_topups (warga_id, nominal, admin_id, note)
       VALUES ($1, $2, $3, $4)`,
      [wargaId, nominal, adminId, note]
    );

    const saldoBulanIni = await getCurrentMonthSaldoByWarga(client, wargaId);

    await client.query('COMMIT');
    return saldoBulanIni;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function editNominalJimpitanByAdmin({ wargaId, nominalBaru, tanggalOperasional }) {
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
  const result = await pool.query(
    `SELECT
       TO_CHAR(jd.tanggal::date, 'YYYY-MM-DD') AS tanggal,
       COALESCE(SUM(jd.nominal), 0) AS total_nominal,
       COUNT(DISTINCT jd.warga_id) AS total_rumah,
       COUNT(DISTINCT jd.petugas_id) AS total_petugas
     FROM jimpitan_details jd
     WHERE TO_CHAR(jd.tanggal::date, 'YYYY-MM') = $1
     GROUP BY jd.tanggal::date
     ORDER BY jd.tanggal::date ASC`,
    [month]
  );

  const byPetugas = await pool.query(
    `SELECT
       TO_CHAR(jd.tanggal::date, 'YYYY-MM-DD') AS tanggal,
       u.nama AS petugas_nama,
       COALESCE(SUM(jd.nominal), 0) AS total_nominal
     FROM jimpitan_details jd
     LEFT JOIN users u ON u.id::text = jd.petugas_id::text
     WHERE TO_CHAR(jd.tanggal::date, 'YYYY-MM') = $1
     GROUP BY jd.tanggal::date, u.nama
     ORDER BY jd.tanggal::date ASC, u.nama ASC`,
    [month]
  );

  return {
    days: result.rows.map((r) => ({
      tanggal: String(r.tanggal),
      total_nominal: Number(r.total_nominal || 0),
      total_rumah: Number(r.total_rumah || 0),
      total_petugas: Number(r.total_petugas || 0)
    })),
    by_petugas: byPetugas.rows.map((r) => ({
      tanggal: String(r.tanggal),
      petugas_nama: String(r.petugas_nama || '-'),
      total_nominal: Number(r.total_nominal || 0)
    }))
  };
}
