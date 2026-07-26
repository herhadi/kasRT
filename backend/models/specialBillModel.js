import { pool } from '../db.js';
import { ELIGIBLE_USERS_CLAUSE } from './eligibleUsersSql.js';

export async function ensureSpecialBillTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS special_bills (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(160) NOT NULL,
      description TEXT NULL,
      amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      pic_user_id UUID NOT NULL REFERENCES users(id),
      status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','HIDDEN','CLOSED','CANCELLED')),
      dashboard_visible BOOLEAN NOT NULL DEFAULT TRUE,
      created_by UUID NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      hidden_by UUID NULL REFERENCES users(id),
      hidden_at TIMESTAMPTZ NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS special_bill_targets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      bill_id UUID NOT NULL REFERENCES special_bills(id) ON DELETE CASCADE,
      warga_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_amount NUMERIC(18, 2) NOT NULL CHECK (target_amount >= 0),
      paid_amount NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      status VARCHAR(20) NOT NULL DEFAULT 'UNPAID' CHECK (status IN ('UNPAID','PARTIAL','COLLECTED','APPROVED','WAIVED')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (bill_id, warga_id)
    )
  `);

  await pool.query(`
    ALTER TABLE special_bill_targets
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_special_bills_visible_dates
    ON special_bills (dashboard_visible, status, start_date, end_date)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_special_bill_targets_warga
    ON special_bill_targets (warga_id, bill_id)
  `);
}

export async function listSpecialBillOptions() {
  await ensureSpecialBillTables();
  const result = await pool.query(
    `SELECT
       u.id::text AS id,
       u.nama,
       u.no_hp
     FROM users u
     WHERE ${ELIGIBLE_USERS_CLAUSE}
     ORDER BY u.nama ASC`
  );
  return result.rows;
}

export async function createSpecialBill({
  title,
  description = null,
  amount,
  startDate,
  endDate,
  picUserId,
  createdBy
}) {
  await ensureSpecialBillTables();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const billResult = await client.query(
      `INSERT INTO special_bills
         (title, description, amount, start_date, end_date, pic_user_id, created_by)
       VALUES ($1, NULLIF($2, ''), $3::numeric, $4::date, $5::date, $6::uuid, $7::uuid)
       RETURNING
         id::text,
         title,
         description,
         amount,
         start_date,
         end_date,
         pic_user_id::text,
         (SELECT nama FROM users WHERE id = pic_user_id) AS pic_name,
         status,
         dashboard_visible,
         created_at`,
      [title, description, amount, startDate, endDate, picUserId, createdBy]
    );
    const bill = billResult.rows[0];
    await client.query(
      `INSERT INTO special_bill_targets (bill_id, warga_id, target_amount)
       SELECT $1::uuid, u.id, $2::numeric
       FROM users u
       WHERE ${ELIGIBLE_USERS_CLAUSE}
       ON CONFLICT (bill_id, warga_id) DO NOTHING`,
      [bill.id, amount]
    );
    await client.query('COMMIT');
    return bill;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listSpecialBills() {
  await ensureSpecialBillTables();
  const result = await pool.query(
    `SELECT
       sb.id::text,
       sb.title,
       sb.description,
       sb.amount,
       TO_CHAR(sb.start_date, 'YYYY-MM-DD') AS start_date,
       TO_CHAR(sb.end_date, 'YYYY-MM-DD') AS end_date,
       sb.pic_user_id::text,
       pic.nama AS pic_name,
       sb.status,
       sb.dashboard_visible,
       sb.created_at,
       creator.nama AS created_by_name,
       COUNT(sbt.id) FILTER (WHERE sbt.is_active = TRUE)::int AS target_count,
       COALESCE(SUM(sbt.target_amount) FILTER (WHERE sbt.is_active = TRUE), 0) AS total_target,
       COALESCE(SUM(sbt.paid_amount), 0) AS total_paid
     FROM special_bills sb
     JOIN users pic ON pic.id = sb.pic_user_id
     LEFT JOIN users creator ON creator.id = sb.created_by
     LEFT JOIN special_bill_targets sbt ON sbt.bill_id = sb.id
     GROUP BY sb.id, pic.nama, creator.nama
     ORDER BY sb.created_at DESC`
  );
  return result.rows.map((row) => ({
    ...row,
    amount: Number(row.amount || 0),
    total_target: Number(row.total_target || 0),
    total_paid: Number(row.total_paid || 0),
    target_count: Number(row.target_count || 0)
  }));
}

export async function hideSpecialBillFromDashboard({ billId, actorId }) {
  await ensureSpecialBillTables();
  const result = await pool.query(
    `UPDATE special_bills
     SET dashboard_visible = FALSE,
         status = CASE WHEN status = 'ACTIVE' THEN 'HIDDEN' ELSE status END,
         hidden_by = $2::uuid,
         hidden_at = NOW(),
         updated_at = NOW()
     WHERE id = $1::uuid
     RETURNING id::text, title, dashboard_visible, status`,
    [billId, actorId]
  );
  return result.rows[0] || null;
}

export async function listVisibleSpecialBillsForWarga(userId) {
  await ensureSpecialBillTables();
  const result = await pool.query(
    `SELECT
       sb.id::text,
       sb.title,
       sb.description,
       sb.amount,
       TO_CHAR(sb.start_date, 'YYYY-MM-DD') AS start_date,
       TO_CHAR(sb.end_date, 'YYYY-MM-DD') AS end_date,
       sb.pic_user_id::text,
       pic.nama AS pic_name,
       sbt.target_amount,
       sbt.paid_amount,
       GREATEST(sbt.target_amount - sbt.paid_amount, 0) AS remaining_amount,
       sbt.status,
       CASE
         WHEN CURRENT_DATE < sb.start_date THEN 'BELUM_MULAI'
         WHEN CURRENT_DATE > sb.end_date THEN 'TERLAMBAT'
         WHEN sbt.paid_amount >= sbt.target_amount THEN 'LUNAS'
         WHEN sbt.paid_amount > 0 THEN 'SEBAGIAN'
         ELSE 'BELUM'
       END AS display_status
     FROM special_bill_targets sbt
     JOIN special_bills sb ON sb.id = sbt.bill_id
     JOIN users pic ON pic.id = sb.pic_user_id
     WHERE sbt.warga_id = $1::uuid
       AND sbt.is_active = TRUE
       AND sb.dashboard_visible = TRUE
       AND sb.status = 'ACTIVE'
     ORDER BY sb.end_date ASC, sb.created_at DESC`,
    [userId]
  );
  return result.rows.map((row) => ({
    ...row,
    amount: Number(row.amount || 0),
    target_amount: Number(row.target_amount || 0),
    paid_amount: Number(row.paid_amount || 0),
    remaining_amount: Number(row.remaining_amount || 0)
  }));
}

export async function listTelegramTargetsForBill(billId) {
  await ensureSpecialBillTables();
  const result = await pool.query(
    `SELECT
       u.id::text,
       u.nama,
       u.telegram_chat_id
     FROM special_bill_targets sbt
     JOIN users u ON u.id = sbt.warga_id
     WHERE sbt.bill_id = $1::uuid
       AND sbt.is_active = TRUE
       AND u.telegram_chat_id IS NOT NULL
       AND TRIM(u.telegram_chat_id) <> ''`,
    [billId]
  );
  return result.rows;
}

export async function listSpecialBillTargets(billId) {
  await ensureSpecialBillTables();
  const result = await pool.query(
    `SELECT
       sbt.id::text,
       sbt.bill_id::text,
       sbt.warga_id::text,
       u.nama,
       u.no_hp,
       sbt.target_amount,
       sbt.paid_amount,
       GREATEST(sbt.target_amount - sbt.paid_amount, 0) AS remaining_amount,
       sbt.is_active,
       sbt.status
     FROM special_bill_targets sbt
     JOIN users u ON u.id = sbt.warga_id
     WHERE sbt.bill_id = $1::uuid
     ORDER BY u.nama ASC`,
    [billId]
  );
  return result.rows.map((row) => ({
    ...row,
    target_amount: Number(row.target_amount || 0),
    paid_amount: Number(row.paid_amount || 0),
    remaining_amount: Number(row.remaining_amount || 0),
    is_active: Boolean(row.is_active)
  }));
}

export async function setSpecialBillTargetActive({ billId, wargaId, isActive }) {
  await ensureSpecialBillTables();
  const result = await pool.query(
    `UPDATE special_bill_targets
     SET is_active = $3,
         updated_at = NOW()
     WHERE bill_id = $1::uuid
       AND warga_id = $2::uuid
     RETURNING id::text, bill_id::text, warga_id::text, is_active`,
    [billId, wargaId, Boolean(isActive)]
  );
  return result.rows[0] || null;
}
