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
    CREATE TABLE IF NOT EXISTS special_bill_batches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      bill_id UUID NOT NULL REFERENCES special_bills(id) ON DELETE CASCADE,
      pic_user_id UUID NOT NULL REFERENCES users(id),
      total_amount NUMERIC(18, 2) NOT NULL CHECK (total_amount > 0),
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
      transaction_id UUID NULL REFERENCES transactions(id),
      created_by UUID NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      approved_by UUID NULL REFERENCES users(id),
      approved_at TIMESTAMPTZ NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS special_bill_payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      bill_id UUID NOT NULL REFERENCES special_bills(id) ON DELETE CASCADE,
      target_id UUID NOT NULL REFERENCES special_bill_targets(id) ON DELETE CASCADE,
      warga_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
      status VARCHAR(20) NOT NULL DEFAULT 'COLLECTED' CHECK (status IN ('COLLECTED','PENDING','APPROVED','REJECTED')),
      batch_id UUID NULL REFERENCES special_bill_batches(id) ON DELETE SET NULL,
      collected_by UUID NULL REFERENCES users(id),
      collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS special_bill_batch_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      batch_id UUID NOT NULL REFERENCES special_bill_batches(id) ON DELETE CASCADE,
      target_id UUID NOT NULL REFERENCES special_bill_targets(id) ON DELETE CASCADE,
      amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
      UNIQUE (batch_id, target_id)
    )
  `);

  await pool.query(`
    ALTER TABLE special_bill_targets
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE
  `);

  await pool.query(`
    ALTER TABLE special_bill_payments
      ADD COLUMN IF NOT EXISTS batch_id UUID NULL REFERENCES special_bill_batches(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS collected_by UUID NULL REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_special_bills_visible_dates
    ON special_bills (dashboard_visible, status, start_date, end_date)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_special_bill_targets_warga
    ON special_bill_targets (warga_id, bill_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_special_bill_payments_bill_status
    ON special_bill_payments (bill_id, status, batch_id)
  `);
}

export async function findSpecialBillById(billId) {
  await ensureSpecialBillTables();
  const result = await pool.query(
    `SELECT id::text, title, pic_user_id::text, amount, status
     FROM special_bills
     WHERE id = $1::uuid
     LIMIT 1`,
    [billId]
  );
  return result.rows[0] || null;
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

export async function listSpecialBillsForPic(picUserId) {
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
       COUNT(sbt.id) FILTER (WHERE sbt.is_active = TRUE)::int AS target_count,
       COALESCE(SUM(sbt.target_amount) FILTER (WHERE sbt.is_active = TRUE), 0) AS total_target,
       COALESCE(SUM(sbt.paid_amount), 0) AS total_paid
     FROM special_bills sb
     JOIN users pic ON pic.id = sb.pic_user_id
     LEFT JOIN special_bill_targets sbt ON sbt.bill_id = sb.id
     WHERE sb.pic_user_id = $1::uuid
       AND sb.status = 'ACTIVE'
     GROUP BY sb.id, pic.nama
     ORDER BY sb.end_date ASC, sb.created_at DESC`,
    [picUserId]
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
       COALESCE(pay.collected_amount, 0) AS collected_amount,
       COALESCE(pay.pending_amount, 0) AS pending_amount,
       COALESCE(pay.approved_amount, 0) AS approved_amount,
       GREATEST(sbt.target_amount - sbt.paid_amount, 0) AS remaining_amount,
       sbt.status,
       CASE
         WHEN COALESCE(pay.approved_amount, 0) >= sbt.target_amount THEN 'LUNAS'
         WHEN COALESCE(pay.pending_amount, 0) > 0 THEN 'MENUNGGU_APPROVAL'
         WHEN COALESCE(pay.collected_amount, 0) > 0 THEN 'TERKUMPUL'
         WHEN CURRENT_DATE < sb.start_date THEN 'BELUM_MULAI'
         WHEN CURRENT_DATE > sb.end_date THEN 'TERLAMBAT'
         WHEN sbt.paid_amount > 0 THEN 'SEBAGIAN'
         ELSE 'BELUM'
       END AS display_status
     FROM special_bill_targets sbt
     JOIN special_bills sb ON sb.id = sbt.bill_id
     JOIN users pic ON pic.id = sb.pic_user_id
     LEFT JOIN (
       SELECT
         target_id,
         COALESCE(SUM(amount) FILTER (WHERE status = 'COLLECTED'), 0) AS collected_amount,
         COALESCE(SUM(amount) FILTER (WHERE status = 'PENDING'), 0) AS pending_amount,
         COALESCE(SUM(amount) FILTER (WHERE status = 'APPROVED'), 0) AS approved_amount
       FROM special_bill_payments
       WHERE warga_id = $1::uuid
       GROUP BY target_id
     ) pay ON pay.target_id = sbt.id
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
    collected_amount: Number(row.collected_amount || 0),
    pending_amount: Number(row.pending_amount || 0),
    approved_amount: Number(row.approved_amount || 0),
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
       COALESCE(pay.collected_amount, 0) AS collected_amount,
       COALESCE(pay.pending_amount, 0) AS pending_amount,
       COALESCE(pay.approved_amount, 0) AS approved_amount,
       GREATEST(sbt.target_amount - sbt.paid_amount, 0) AS remaining_amount,
       sbt.is_active,
       sbt.status
     FROM special_bill_targets sbt
     JOIN users u ON u.id = sbt.warga_id
     LEFT JOIN (
       SELECT
         target_id,
         COALESCE(SUM(amount) FILTER (WHERE status = 'COLLECTED'), 0) AS collected_amount,
         COALESCE(SUM(amount) FILTER (WHERE status = 'PENDING'), 0) AS pending_amount,
         COALESCE(SUM(amount) FILTER (WHERE status = 'APPROVED'), 0) AS approved_amount
       FROM special_bill_payments
       WHERE bill_id = $1::uuid
       GROUP BY target_id
     ) pay ON pay.target_id = sbt.id
     WHERE sbt.bill_id = $1::uuid
     ORDER BY u.nama ASC`,
    [billId]
  );
  return result.rows.map((row) => ({
    ...row,
    target_amount: Number(row.target_amount || 0),
    paid_amount: Number(row.paid_amount || 0),
    collected_amount: Number(row.collected_amount || 0),
    pending_amount: Number(row.pending_amount || 0),
    approved_amount: Number(row.approved_amount || 0),
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

export async function recordSpecialBillPayment({ billId, wargaId, amount, collectedBy }) {
  await ensureSpecialBillTables();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const targetRes = await client.query(
      `SELECT id::text, target_amount, paid_amount
       FROM special_bill_targets
       WHERE bill_id = $1::uuid
         AND warga_id = $2::uuid
         AND is_active = TRUE
       FOR UPDATE`,
      [billId, wargaId]
    );
    const target = targetRes.rows[0];
    if (!target) {
      await client.query('ROLLBACK');
      return null;
    }
    const remaining = Math.max(Number(target.target_amount || 0) - Number(target.paid_amount || 0), 0);
    const safeAmount = Math.min(Number(amount || 0), remaining);
    if (safeAmount <= 0) throw new Error('Tagihan warga ini sudah lunas');
    const paymentRes = await client.query(
      `INSERT INTO special_bill_payments (bill_id, target_id, warga_id, amount, status, collected_by)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::numeric, 'COLLECTED', $5::uuid)
       RETURNING id::text, amount, status, collected_at`,
      [billId, target.id, wargaId, safeAmount, collectedBy]
    );
    const updatedRes = await client.query(
      `UPDATE special_bill_targets
       SET paid_amount = paid_amount + $2::numeric,
           status = CASE
             WHEN paid_amount + $2::numeric >= target_amount THEN 'COLLECTED'
             ELSE 'PARTIAL'
           END,
           updated_at = NOW()
       WHERE id = $1::uuid
       RETURNING id::text, bill_id::text, warga_id::text, target_amount, paid_amount, status`,
      [target.id, safeAmount]
    );
    await client.query('COMMIT');
    return { ...updatedRes.rows[0], payment: paymentRes.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateSpecialBillPayment({ billId, paymentId, amount, actorId }) {
  await ensureSpecialBillTables();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const paymentRes = await client.query(
      `SELECT
         sbp.id::text,
         sbp.bill_id::text,
         sbp.target_id::text,
         sbp.warga_id::text,
         sbp.amount,
         sbp.status,
         sbt.target_amount,
         sbt.paid_amount
       FROM special_bill_payments sbp
       JOIN special_bill_targets sbt ON sbt.id = sbp.target_id
       WHERE sbp.id = $1::uuid
         AND sbp.bill_id = $2::uuid
       FOR UPDATE`,
      [paymentId, billId]
    );
    const payment = paymentRes.rows[0];
    if (!payment) {
      await client.query('ROLLBACK');
      return null;
    }
    if (payment.status !== 'COLLECTED') {
      throw new Error('Pembayaran yang sudah diajukan/approve tidak bisa diedit langsung');
    }
    const oldAmount = Number(payment.amount || 0);
    const currentPaid = Number(payment.paid_amount || 0);
    const targetAmount = Number(payment.target_amount || 0);
    const maxAmount = Math.max(targetAmount - (currentPaid - oldAmount), 0);
    const safeAmount = Math.min(Number(amount || 0), maxAmount);
    if (!Number.isFinite(safeAmount) || safeAmount <= 0) throw new Error('Nominal koreksi tidak valid');
    const delta = safeAmount - oldAmount;

    const updatedPaymentRes = await client.query(
      `UPDATE special_bill_payments
       SET amount = $3::numeric,
           collected_by = $4::uuid,
           collected_at = NOW()
       WHERE id = $1::uuid
         AND bill_id = $2::uuid
         AND status = 'COLLECTED'
       RETURNING id::text, bill_id::text, target_id::text, warga_id::text, amount, status, collected_at`,
      [paymentId, billId, safeAmount, actorId]
    );
    await client.query(
      `UPDATE special_bill_targets
       SET paid_amount = GREATEST(paid_amount + $2::numeric, 0),
           status = CASE
             WHEN GREATEST(paid_amount + $2::numeric, 0) >= target_amount THEN 'COLLECTED'
             WHEN GREATEST(paid_amount + $2::numeric, 0) > 0 THEN 'PARTIAL'
             ELSE 'UNPAID'
           END,
           updated_at = NOW()
       WHERE id = $1::uuid`,
      [payment.target_id, delta]
    );
    await client.query('COMMIT');
    return { ...updatedPaymentRes.rows[0], old_amount: oldAmount, new_amount: safeAmount };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createSpecialBillBatch({ billId, actorId }) {
  await ensureSpecialBillTables();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const billRes = await client.query(
      `SELECT sb.id::text, sb.title, sb.pic_user_id::text, pic.nama AS pic_name
       FROM special_bills sb
       JOIN users pic ON pic.id = sb.pic_user_id
       WHERE sb.id = $1::uuid
       FOR UPDATE`,
      [billId]
    );
    const bill = billRes.rows[0];
    if (!bill) throw new Error('Tagihan tidak ditemukan');
    const pendingRes = await client.query(
      `SELECT id::text
       FROM special_bill_batches
       WHERE bill_id = $1::uuid
         AND status = 'PENDING'
       LIMIT 1`,
      [billId]
    );
    if (pendingRes.rows.length) throw new Error('Masih ada setoran tagihan yang menunggu approval');

    const itemsRes = await client.query(
      `SELECT id::text, target_id::text, amount
       FROM special_bill_payments
       WHERE bill_id = $1::uuid
         AND status = 'COLLECTED'
         AND batch_id IS NULL
       FOR UPDATE`,
      [billId]
    );
    const total = itemsRes.rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    if (total <= 0) throw new Error('Belum ada pembayaran yang bisa disetorkan');

    const batchRes = await client.query(
      `INSERT INTO special_bill_batches (bill_id, pic_user_id, total_amount, created_by)
       VALUES ($1::uuid, $2::uuid, $3::numeric, $4::uuid)
       RETURNING id::text, total_amount, created_at`,
      [billId, bill.pic_user_id, total, actorId]
    );
    const batch = batchRes.rows[0];
    await client.query(
      `INSERT INTO special_bill_batch_items (batch_id, target_id, amount)
       SELECT $1::uuid, target_id, SUM(amount)
       FROM special_bill_payments
       WHERE bill_id = $2::uuid
         AND status = 'COLLECTED'
         AND batch_id IS NULL
       GROUP BY target_id`,
      [batch.id, billId]
    );
    await client.query(
      `UPDATE special_bill_payments
       SET status = 'PENDING',
           batch_id = $2::uuid
       WHERE bill_id = $1::uuid
         AND status = 'COLLECTED'
         AND batch_id IS NULL`,
      [billId, batch.id]
    );
    await client.query('COMMIT');
    return { ...batch, bill_title: bill.title, pic_name: bill.pic_name, total_amount: Number(batch.total_amount || 0) };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listPendingSpecialBillBatches() {
  await ensureSpecialBillTables();
  const result = await pool.query(
    `SELECT
       sbb.id::text,
       sbb.total_amount,
       sbb.created_at,
       sb.title,
       pic.nama AS pic_name,
       sbb.created_by::text
     FROM special_bill_batches sbb
     JOIN special_bills sb ON sb.id = sbb.bill_id
     JOIN users pic ON pic.id = sbb.pic_user_id
     WHERE sbb.status = 'PENDING'
     ORDER BY sbb.created_at ASC`
  );
  return result.rows.map((row) => ({
    kind: 'SPECIAL_BILL_BATCH',
    id: row.id,
    title: `Setoran Tagihan Khusus`,
    description: `${row.title} • PIC: ${row.pic_name || '-'}`,
    amount: Number(row.total_amount || 0),
    created_at: row.created_at,
    meta: { batch_id: row.id, created_by: row.created_by }
  }));
}

export async function approveSpecialBillBatch({ batchId, approverId }) {
  await ensureSpecialBillTables();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const batchRes = await client.query(
      `SELECT sbb.id::text, sbb.bill_id::text, sbb.pic_user_id::text, sbb.total_amount, sb.title, sbb.transaction_id
       FROM special_bill_batches sbb
       JOIN special_bills sb ON sb.id = sbb.bill_id
       WHERE sbb.id = $1::uuid
         AND sbb.status = 'PENDING'
       FOR UPDATE`,
      [batchId]
    );
    const batch = batchRes.rows[0];
    if (!batch) throw new Error('Setoran tagihan tidak ditemukan atau sudah diproses');
    const walletRes = await client.query(`SELECT id FROM wallets WHERE LOWER(name) = LOWER('Kas Iuran Wajib') LIMIT 1`);
    if (!walletRes.rows.length) throw new Error('Wallet Kas Iuran Wajib tidak ditemukan');
    const txRes = await client.query(
      `INSERT INTO transactions (type, target_wallet_id, amount, status, description, created_by, approved_by, approved_at)
       VALUES ('IN', $1, $2::numeric, 'APPROVED', $3, $4::uuid, $4::uuid, NOW())
       RETURNING id`,
      [walletRes.rows[0].id, batch.total_amount, `[SPECIAL_BILL] ${batch.title}`, approverId]
    );
    await client.query(
      `UPDATE special_bill_batches
       SET status = 'APPROVED',
           transaction_id = $2,
           approved_by = $3::uuid,
           approved_at = NOW()
       WHERE id = $1::uuid`,
      [batchId, txRes.rows[0].id, approverId]
    );
    await client.query(
      `UPDATE special_bill_targets sbt
       SET status = CASE
             WHEN sbt.paid_amount >= sbt.target_amount THEN 'APPROVED'
             WHEN sbt.paid_amount > 0 THEN 'PARTIAL'
             ELSE 'UNPAID'
           END,
           updated_at = NOW()
       FROM special_bill_batch_items sbbi
       WHERE sbbi.target_id = sbt.id
         AND sbbi.batch_id = $1::uuid`,
      [batchId]
    );
    await client.query(
      `UPDATE special_bill_payments
       SET status = 'APPROVED'
       WHERE batch_id = $1::uuid
         AND status = 'PENDING'`,
      [batchId]
    );
    await client.query('COMMIT');
    return { id: batch.id, bill_id: batch.bill_id, pic_user_id: batch.pic_user_id, amount: Number(batch.total_amount || 0), title: batch.title };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getSpecialBillNotificationContext({ billId, wargaId = null, paymentId = null, batchId = null }) {
  await ensureSpecialBillTables();
  if (paymentId) {
    const result = await pool.query(
      `SELECT
         sb.title,
         TO_CHAR(sb.start_date, 'YYYY-MM-DD') AS start_date,
         TO_CHAR(sb.end_date, 'YYYY-MM-DD') AS end_date,
         sbp.amount,
         u.id::text AS warga_id,
         u.nama AS warga_name,
         u.telegram_chat_id,
         pic.nama AS pic_name
       FROM special_bill_payments sbp
       JOIN special_bills sb ON sb.id = sbp.bill_id
       JOIN users u ON u.id = sbp.warga_id
       JOIN users pic ON pic.id = sb.pic_user_id
       WHERE sbp.id = $1::uuid
       LIMIT 1`,
      [paymentId]
    );
    return result.rows[0] || null;
  }

  if (batchId) {
    const result = await pool.query(
      `SELECT DISTINCT
         sb.title,
         sbb.total_amount,
         sbb.pic_user_id::text,
         pic.nama AS pic_name,
         u.id::text AS warga_id,
         u.nama AS warga_name,
         u.telegram_chat_id,
         COALESCE(SUM(sbp.amount) OVER (PARTITION BY u.id), 0) AS warga_amount
       FROM special_bill_batches sbb
       JOIN special_bills sb ON sb.id = sbb.bill_id
       JOIN users pic ON pic.id = sbb.pic_user_id
       JOIN special_bill_payments sbp ON sbp.batch_id = sbb.id
       JOIN users u ON u.id = sbp.warga_id
       WHERE sbb.id = $1::uuid`,
      [batchId]
    );
    return result.rows;
  }

  if (billId && wargaId) {
    const result = await pool.query(
      `SELECT
         sb.title,
         TO_CHAR(sb.start_date, 'YYYY-MM-DD') AS start_date,
         TO_CHAR(sb.end_date, 'YYYY-MM-DD') AS end_date,
         sbt.target_amount,
         sbt.paid_amount,
         GREATEST(sbt.target_amount - sbt.paid_amount, 0) AS remaining_amount,
         u.id::text AS warga_id,
         u.nama AS warga_name,
         u.telegram_chat_id,
         pic.nama AS pic_name
       FROM special_bill_targets sbt
       JOIN special_bills sb ON sb.id = sbt.bill_id
       JOIN users u ON u.id = sbt.warga_id
       JOIN users pic ON pic.id = sb.pic_user_id
       WHERE sbt.bill_id = $1::uuid
         AND sbt.warga_id = $2::uuid
       LIMIT 1`,
      [billId, wargaId]
    );
    return result.rows[0] || null;
  }

  return null;
}

export async function listSpecialBillPaymentHistory(billId) {
  await ensureSpecialBillTables();
  const result = await pool.query(
    `SELECT
       sbp.id::text,
       sbp.bill_id::text,
       sbp.warga_id::text,
       u.nama AS warga_name,
       sbp.amount,
       sbp.status,
       sbp.batch_id::text,
       sbp.collected_at,
       collector.nama AS collected_by_name,
       sbb.approved_at,
       approver.nama AS approved_by_name
     FROM special_bill_payments sbp
     JOIN users u ON u.id = sbp.warga_id
     LEFT JOIN users collector ON collector.id = sbp.collected_by
     LEFT JOIN special_bill_batches sbb ON sbb.id = sbp.batch_id
     LEFT JOIN users approver ON approver.id = sbb.approved_by
     WHERE sbp.bill_id = $1::uuid
     ORDER BY sbp.collected_at DESC`,
    [billId]
  );
  return result.rows.map((row) => ({
    ...row,
    amount: Number(row.amount || 0)
  }));
}
