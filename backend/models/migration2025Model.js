import { pool } from '../db.js';
import { ELIGIBLE_USERS_CLAUSE } from './eligibleUsersSql.js';
import { buildInstallmentPlan, ensureKoperasiTables } from './koperasiModel.js';
import { ensureIuranTariffTable } from './bendaharaModel.js';
import { randomUUID } from 'crypto';

const IURAN_WAJIB_TARGET_BULANAN = 30000;
const JIMPITAN_TARGET_BULANAN = 15000;
const TARGET_TAHUNAN_12_BULAN_IURAN = IURAN_WAJIB_TARGET_BULANAN * 12;
const TARGET_TAHUNAN_12_BULAN_JIMPITAN = JIMPITAN_TARGET_BULANAN * 12;

export const MIGRATION_MONTH_KEYS_2025 = Array.from({ length: 12 }, (_, i) =>
  `2025-${String(i + 1).padStart(2, '0')}`
);

function mapMigrationAmountRows(rows) {
  const map = new Map(
    rows.map((r) => [String(r.month_key), Number(r.amount || 0)])
  );
  return MIGRATION_MONTH_KEYS_2025.map((month) => ({
    month,
    amount: Number(map.get(month) ?? 0)
  }));
}

export async function getJimpitanMigrationWargaDetail2025(wargaId) {
  await ensureMigration2025Tables();
  const id = String(wargaId || '').trim();
  if (!id) throw new Error('warga_id tidak valid');
  const rs = await pool.query(
    `SELECT month_key, amount
     FROM mig_jimpitan_payments_2025
     WHERE warga_id = $1::uuid
     ORDER BY month_key ASC`,
    [id]
  );
  return { warga_id: id, months: mapMigrationAmountRows(rs.rows) };
}

export async function getTabunganMigrationWargaDetail2025(wargaId) {
  await ensureMigration2025Tables();
  const id = String(wargaId || '').trim();
  if (!id) throw new Error('warga_id tidak valid');
  const rs = await pool.query(
    `SELECT month_key, amount
     FROM mig_tabungan_ledger_2025
     WHERE warga_id = $1::uuid
     ORDER BY month_key ASC`,
    [id]
  );
  return { warga_id: id, months: mapMigrationAmountRows(rs.rows) };
}

function mapMigrationIuranRows(rows, tariffDefaults) {
  const map = new Map(
    rows.map((r) => [
      String(r.month),
      {
        target_amount: Number(r.target_amount || 0),
        paid_amount: Number(r.paid_amount || 0)
      }
    ])
  );
  return MIGRATION_MONTH_KEYS_2025.map((month) => {
    const saved = map.get(month);
    const defaultTarget = Number(tariffDefaults[month] ?? IURAN_WAJIB_TARGET_BULANAN);
    return {
      month,
      target_amount: saved ? saved.target_amount : defaultTarget,
      paid_amount: saved ? saved.paid_amount : 0,
      has_saved: Boolean(saved)
    };
  });
}

export function buildMigrationTariffDefaults2025(tariffTable, defaultFee) {
  return getTariffByMonth(tariffTable, defaultFee).then((tariffs) => {
    const months = {};
    for (const month of MIGRATION_MONTH_KEYS_2025) {
      months[month] = feeForMonth(tariffs, month, defaultFee);
    }
    return months;
  });
}

export async function getIuranMigrationTariffDefaults2025() {
  await ensureIuranTariffTable();
  const months = await buildMigrationTariffDefaults2025('iw_tariffs', IURAN_WAJIB_TARGET_BULANAN);
  return { months: MIGRATION_MONTH_KEYS_2025.map((month) => ({ month, amount: months[month] })) };
}

export async function getInternetMigrationTariffDefaults2025() {
  const months = await buildMigrationTariffDefaults2025('inet_tariffs', 60000);
  return { months: MIGRATION_MONTH_KEYS_2025.map((month) => ({ month, amount: months[month] })) };
}

export async function getLingkunganMigrationTariffDefaults2025() {
  const months = await buildMigrationTariffDefaults2025('lh_tariffs', 20000);
  return { months: MIGRATION_MONTH_KEYS_2025.map((month) => ({ month, amount: months[month] })) };
}

export async function getJimpitanMigrationTariffDefaults2025() {
  return {
    months: MIGRATION_MONTH_KEYS_2025.map((month) => ({
      month,
      amount: JIMPITAN_TARGET_BULANAN
    }))
  };
}

export async function getIuranMigrationWargaDetail2025(wargaId) {
  await ensureMigration2025Tables();
  await ensureIuranTariffTable();
  const id = String(wargaId || '').trim();
  if (!id) throw new Error('warga_id tidak valid');
  const tariffMap = await buildMigrationTariffDefaults2025('iw_tariffs', IURAN_WAJIB_TARGET_BULANAN);
  const rs = await pool.query(
    `SELECT month, target_amount, paid_amount
     FROM mig_iuran_wajib_2025
     WHERE warga_id = $1::uuid
     ORDER BY month ASC`,
    [id]
  );
  return { warga_id: id, months: mapMigrationIuranRows(rs.rows, tariffMap) };
}

export async function getInternetMigrationWargaDetail2025(wargaId) {
  await ensureMigration2025Tables();
  const id = String(wargaId || '').trim();
  if (!id) throw new Error('warga_id tidak valid');
  const rs = await pool.query(
    `SELECT month_key, amount
     FROM mig_inet_payments_2025
     WHERE warga_id = $1::uuid
     ORDER BY month_key ASC`,
    [id]
  );
  return { warga_id: id, months: mapMigrationAmountRows(rs.rows) };
}

export async function getLingkunganMigrationWargaDetail2025(wargaId) {
  await ensureMigration2025Tables();
  const id = String(wargaId || '').trim();
  if (!id) throw new Error('warga_id tidak valid');
  const rs = await pool.query(
    `SELECT month_key, amount
     FROM mig_lh_payments_2025
     WHERE warga_id = $1::uuid
     ORDER BY month_key ASC`,
    [id]
  );
  return { warga_id: id, months: mapMigrationAmountRows(rs.rows) };
}

export async function getKoperasiIuranMigrationWargaDetail2025(wargaId) {
  await ensureMigration2025Tables();
  const id = String(wargaId || '').trim();
  if (!id) throw new Error('warga_id tidak valid');
  const rs = await pool.query(
    `SELECT month_key, amount
     FROM mig_kop_iuran_2025
     WHERE warga_id = $1::uuid
     ORDER BY month_key ASC`,
    [id]
  );
  return { warga_id: id, months: mapMigrationAmountRows(rs.rows) };
}

export async function getSosialMigrationDetail2025() {
  await ensureMigration2025Tables();
  const rs = await pool.query(
    `SELECT month_key, pemasukan, pengeluaran
     FROM mig_sosial_wallet_2025
     ORDER BY month_key ASC`
  );
  const map = new Map(
    rs.rows.map((r) => [
      String(r.month_key),
      { pemasukan: Number(r.pemasukan || 0), pengeluaran: Number(r.pengeluaran || 0) }
    ])
  );
  return {
    months: MIGRATION_MONTH_KEYS_2025.map((month) => ({
      month,
      pemasukan: Number(map.get(month)?.pemasukan ?? 0),
      pengeluaran: Number(map.get(month)?.pengeluaran ?? 0)
    }))
  };
}

export async function ensureMigration2025Tables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mig_iuran_wajib_2025 (
      id BIGSERIAL PRIMARY KEY,
      warga_id UUID NOT NULL,
      month VARCHAR(7) NOT NULL,
      target_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      paid_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      created_by UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (warga_id, month)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mig_inet_payments_2025 (
      id BIGSERIAL PRIMARY KEY,
      warga_id UUID NOT NULL,
      month_key VARCHAR(7) NOT NULL,
      amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      created_by UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (warga_id, month_key)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mig_lh_payments_2025 (
      id BIGSERIAL PRIMARY KEY,
      warga_id UUID NOT NULL,
      month_key VARCHAR(7) NOT NULL,
      amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      created_by UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (warga_id, month_key)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mig_jimpitan_payments_2025 (
      id BIGSERIAL PRIMARY KEY,
      warga_id UUID NOT NULL,
      month_key VARCHAR(7) NOT NULL,
      amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      created_by UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (warga_id, month_key)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mig_tabungan_ledger_2025 (
      id BIGSERIAL PRIMARY KEY,
      warga_id UUID NOT NULL,
      month_key VARCHAR(7) NOT NULL,
      amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      created_by UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (warga_id, month_key)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mig_sosial_wallet_2025 (
      id BIGSERIAL PRIMARY KEY,
      month_key VARCHAR(7) NOT NULL UNIQUE,
      pemasukan NUMERIC(18,2) NOT NULL DEFAULT 0,
      pengeluaran NUMERIC(18,2) NOT NULL DEFAULT 0,
      created_by UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mig_kop_iuran_2025 (
      id BIGSERIAL PRIMARY KEY,
      warga_id UUID NOT NULL,
      month_key VARCHAR(7) NOT NULL,
      amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      created_by UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (warga_id, month_key)
    )
  `);
}

export async function upsertIuranWajib2025Rows({ rows, actorId }) {
  await ensureMigration2025Tables();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of rows) {
      const wargaId = String(row.warga_id || '').trim();
      const month = String(row.month || '').trim();
      const targetAmount = Number(row.target_amount || 0);
      const paidAmount = Number(row.paid_amount || 0);
      if (!wargaId) continue;
      if (!/^(2025)-(0[1-9]|1[0-2])$/.test(month)) continue;
      if (!Number.isFinite(targetAmount) || targetAmount < 0) continue;
      if (!Number.isFinite(paidAmount) || paidAmount < 0) continue;
      await client.query(
        `INSERT INTO mig_iuran_wajib_2025
         (warga_id, month, target_amount, paid_amount, created_by, updated_at)
         VALUES ($1::uuid, $2, $3, $4, $5::uuid, NOW())
         ON CONFLICT (warga_id, month)
         DO UPDATE SET
           target_amount = EXCLUDED.target_amount,
           paid_amount = EXCLUDED.paid_amount,
           created_by = EXCLUDED.created_by,
           updated_at = NOW()`,
        [wargaId, month, targetAmount, paidAmount, actorId]
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

export async function listMigrationIuran2025Summary() {
  await ensureMigration2025Tables();
  const rs = await pool.query(
    `WITH warga AS (
      SELECT DISTINCT u.id::text AS warga_id, u.nama
      FROM users u
      WHERE ${ELIGIBLE_USERS_CLAUSE}
    ),
    agg AS (
      SELECT
        m.warga_id::text AS warga_id,
        COALESCE(SUM(m.target_amount), 0) AS total_target_2025,
        COALESCE(SUM(m.paid_amount), 0) AS total_paid_2025
      FROM mig_iuran_wajib_2025 m
      GROUP BY m.warga_id::text
    )
    SELECT
      w.warga_id,
      w.nama,
      $1::numeric AS total_target_2025,
      COALESCE(a.total_paid_2025, 0) AS total_paid_2025,
      GREATEST($1::numeric - COALESCE(a.total_paid_2025, 0), 0) AS closing_arrears_2025
    FROM warga w
    LEFT JOIN agg a ON a.warga_id = w.warga_id
    ORDER BY w.nama ASC`,
    [TARGET_TAHUNAN_12_BULAN_IURAN]
  );
  return rs.rows.map((r) => ({
    warga_id: String(r.warga_id),
    nama: String(r.nama || ''),
    total_target_2025: Number(r.total_target_2025 || 0),
    total_paid_2025: Number(r.total_paid_2025 || 0),
    closing_arrears_2025: Number(r.closing_arrears_2025 || 0)
  }));
}

export async function applyOpeningArrears2026FromMigrationIuran({ actorId }) {
  await ensureMigration2025Tables();
  const typeRs = await pool.query(
    `SELECT id FROM contribution_types WHERE LOWER(TRIM(name))='iuran wajib' LIMIT 1`
  );
  if (!typeRs.rows.length) throw new Error('Contribution type Iuran Wajib tidak ditemukan');
  const contributionTypeId = Number(typeRs.rows[0].id);

  await pool.query(
    `INSERT INTO yearly_warga_contribution_arrears
     (year, warga_id, contribution_type_id, opening_arrears, updated_at)
     SELECT
       2026 AS year,
       s.warga_id::uuid AS warga_id,
       $1::int AS contribution_type_id,
       s.closing_arrears_2025 AS opening_arrears,
       NOW()
     FROM (
       SELECT
         m.warga_id::text AS warga_id,
         GREATEST(COALESCE(SUM(m.target_amount), 0) - COALESCE(SUM(m.paid_amount), 0), 0) AS closing_arrears_2025
       FROM mig_iuran_wajib_2025 m
       GROUP BY m.warga_id::text
     ) s
     ON CONFLICT (year, warga_id, contribution_type_id)
     DO UPDATE SET
       opening_arrears = EXCLUDED.opening_arrears,
       updated_at = NOW()`,
    [contributionTypeId, actorId]
  );
}

async function getTariffByMonth(tableName, defaultFee) {
  const rs = await pool.query(
    `SELECT effective_month, monthly_fee
     FROM ${tableName}
     WHERE effective_month <= '2025-12'
     ORDER BY effective_month ASC`
  );
  const tariffs = rs.rows.map((r) => ({ month: String(r.effective_month), fee: Number(r.monthly_fee || defaultFee) }));
  return tariffs;
}

function feeForMonth(tariffs, month, defaultFee) {
  let fee = defaultFee;
  for (const t of tariffs) {
    if (t.month <= month) fee = t.fee;
  }
  return fee;
}

export async function upsertInternetMigrationRows({ rows, actorId }) {
  await ensureMigration2025Tables();
  for (const row of rows) {
    const wargaId = String(row.warga_id || '').trim();
    const month = String(row.month || '').trim();
    const amount = Number(row.amount || 0);
    if (!wargaId || !/^(2025)-(0[1-9]|1[0-2])$/.test(month) || !Number.isFinite(amount) || amount < 0) continue;
    await pool.query(
      `INSERT INTO mig_inet_payments_2025 (warga_id, month_key, amount, created_by, updated_at)
       VALUES ($1::uuid, $2, $3, $4::uuid, NOW())
       ON CONFLICT (warga_id, month_key)
       DO UPDATE SET amount = EXCLUDED.amount, created_by = EXCLUDED.created_by, updated_at = NOW()`,
      [wargaId, month, amount, actorId]
    );
  }
}

export async function upsertLingkunganMigrationRows({ rows, actorId }) {
  await ensureMigration2025Tables();
  for (const row of rows) {
    const wargaId = String(row.warga_id || '').trim();
    const month = String(row.month || '').trim();
    const amount = Number(row.amount || 0);
    if (!wargaId || !/^(2025)-(0[1-9]|1[0-2])$/.test(month) || !Number.isFinite(amount) || amount < 0) continue;
    await pool.query(
      `INSERT INTO mig_lh_payments_2025 (warga_id, month_key, amount, created_by, updated_at)
       VALUES ($1::uuid, $2, $3, $4::uuid, NOW())
       ON CONFLICT (warga_id, month_key)
       DO UPDATE SET amount = EXCLUDED.amount, created_by = EXCLUDED.created_by, updated_at = NOW()`,
      [wargaId, month, amount, actorId]
    );
  }
}

export async function getInternetMigrationSummary2025() {
  await ensureMigration2025Tables();
  const tariffs = await getTariffByMonth('inet_tariffs', 60000);
  const months = Array.from({ length: 12 }, (_, i) => `2025-${String(i + 1).padStart(2, '0')}`);
  const users = await pool.query(`SELECT u.id::text AS warga_id, u.nama FROM users u WHERE ${ELIGIBLE_USERS_CLAUSE} ORDER BY u.nama`);
  const paidRows = await pool.query(`SELECT warga_id::text AS warga_id, month_key, amount FROM mig_inet_payments_2025`);
  const paidMap = new Map(paidRows.rows.map((r) => [`${r.warga_id}#${r.month_key}`, Number(r.amount || 0)]));
  return users.rows.map((u) => {
    let target = 0;
    let paid = 0;
    months.forEach((m) => {
      target += feeForMonth(tariffs, m, 60000);
      paid += Number(paidMap.get(`${u.warga_id}#${m}`) || 0);
    });
    return { warga_id: String(u.warga_id), nama: String(u.nama || ''), total_target_2025: target, total_paid_2025: paid, closing_arrears_2025: Math.max(target - paid, 0) };
  });
}

export async function getLingkunganMigrationSummary2025() {
  await ensureMigration2025Tables();
  const tariffs = await getTariffByMonth('lh_tariffs', 20000);
  const months = Array.from({ length: 12 }, (_, i) => `2025-${String(i + 1).padStart(2, '0')}`);
  const users = await pool.query(`SELECT u.id::text AS warga_id, u.nama FROM users u WHERE ${ELIGIBLE_USERS_CLAUSE} ORDER BY u.nama`);
  const paidRows = await pool.query(`SELECT warga_id::text AS warga_id, month_key, amount FROM mig_lh_payments_2025`);
  const paidMap = new Map(paidRows.rows.map((r) => [`${r.warga_id}#${r.month_key}`, Number(r.amount || 0)]));
  return users.rows.map((u) => {
    let target = 0;
    let paid = 0;
    months.forEach((m) => {
      target += feeForMonth(tariffs, m, 20000);
      paid += Number(paidMap.get(`${u.warga_id}#${m}`) || 0);
    });
    return { warga_id: String(u.warga_id), nama: String(u.nama || ''), total_target_2025: target, total_paid_2025: paid, closing_arrears_2025: Math.max(target - paid, 0) };
  });
}

export async function upsertJimpitanMigrationRows({ rows, actorId }) {
  await ensureMigration2025Tables();
  for (const row of rows) {
    const wargaId = String(row.warga_id || '').trim();
    const month = String(row.month || '').trim();
    const amount = Number(row.amount || 0);
    if (!wargaId || !/^(2025)-(0[1-9]|1[0-2])$/.test(month) || !Number.isFinite(amount) || amount < 0) continue;
    await pool.query(
      `INSERT INTO mig_jimpitan_payments_2025 (warga_id, month_key, amount, created_by, updated_at)
       VALUES ($1::uuid, $2, $3, $4::uuid, NOW())
       ON CONFLICT (warga_id, month_key)
       DO UPDATE SET amount = EXCLUDED.amount, created_by = EXCLUDED.created_by, updated_at = NOW()`,
      [wargaId, month, amount, actorId]
    );
  }
}

export async function getJimpitanMigrationSummary2025() {
  await ensureMigration2025Tables();
  const users = await pool.query(`SELECT u.id::text AS warga_id, u.nama FROM users u WHERE ${ELIGIBLE_USERS_CLAUSE} ORDER BY u.nama`);
  const paidRows = await pool.query(`SELECT warga_id::text AS warga_id, COALESCE(SUM(amount),0) AS total_paid FROM mig_jimpitan_payments_2025 GROUP BY warga_id::text`);
  const paidMap = new Map(paidRows.rows.map((r) => [String(r.warga_id), Number(r.total_paid || 0)]));
  return users.rows.map((u) => ({
    warga_id: String(u.warga_id),
    nama: String(u.nama || ''),
    total_target_2025: TARGET_TAHUNAN_12_BULAN_JIMPITAN,
    total_paid_2025: Number(paidMap.get(String(u.warga_id)) || 0),
    closing_arrears_2025: Math.max(TARGET_TAHUNAN_12_BULAN_JIMPITAN - Number(paidMap.get(String(u.warga_id)) || 0), 0)
  }));
}

export async function upsertTabunganMigrationRows({ rows, actorId }) {
  await ensureMigration2025Tables();
  for (const row of rows) {
    const wargaId = String(row.warga_id || '').trim();
    const month = String(row.month || '').trim();
    const amount = Number(row.amount || 0);
    if (!wargaId || !/^(2025)-(0[1-9]|1[0-2])$/.test(month) || !Number.isFinite(amount)) continue;
    await pool.query(
      `INSERT INTO mig_tabungan_ledger_2025 (warga_id, month_key, amount, created_by, updated_at)
       VALUES ($1::uuid, $2, $3, $4::uuid, NOW())
       ON CONFLICT (warga_id, month_key)
       DO UPDATE SET amount = EXCLUDED.amount, created_by = EXCLUDED.created_by, updated_at = NOW()`,
      [wargaId, month, amount, actorId]
    );
  }
}

export async function getTabunganMigrationSummary2025() {
  await ensureMigration2025Tables();
  const users = await pool.query(`SELECT u.id::text AS warga_id, u.nama FROM users u WHERE ${ELIGIBLE_USERS_CLAUSE} ORDER BY u.nama`);
  const agg = await pool.query(`SELECT warga_id::text AS warga_id, COALESCE(SUM(amount),0) AS saldo_akhir_2025 FROM mig_tabungan_ledger_2025 GROUP BY warga_id::text`);
  const map = new Map(agg.rows.map((r) => [String(r.warga_id), Number(r.saldo_akhir_2025 || 0)]));
  return users.rows.map((u) => ({
    warga_id: String(u.warga_id),
    nama: String(u.nama || ''),
    saldo_akhir_2025: Number(map.get(String(u.warga_id)) || 0)
  }));
}

export async function upsertSosialMigrationRows({ rows, actorId }) {
  await ensureMigration2025Tables();
  for (const row of rows) {
    const month = String(row.month || '').trim();
    const pemasukan = Number(row.pemasukan || 0);
    const pengeluaran = Number(row.pengeluaran || 0);
    if (!/^(2025)-(0[1-9]|1[0-2])$/.test(month)) continue;
    if (!Number.isFinite(pemasukan) || pemasukan < 0 || !Number.isFinite(pengeluaran) || pengeluaran < 0) continue;
    await pool.query(
      `INSERT INTO mig_sosial_wallet_2025 (month_key, pemasukan, pengeluaran, created_by, updated_at)
       VALUES ($1, $2, $3, $4::uuid, NOW())
       ON CONFLICT (month_key)
       DO UPDATE SET pemasukan = EXCLUDED.pemasukan, pengeluaran = EXCLUDED.pengeluaran, created_by = EXCLUDED.created_by, updated_at = NOW()`,
      [month, pemasukan, pengeluaran, actorId]
    );
  }
}

export async function getSosialMigrationSummary2025() {
  await ensureMigration2025Tables();
  const rows = await pool.query(
    `SELECT month_key, pemasukan, pengeluaran, (pemasukan - pengeluaran) AS saldo_bulan
     FROM mig_sosial_wallet_2025
     ORDER BY month_key ASC`
  );
  const total = rows.rows.reduce((acc, r) => acc + Number(r.saldo_bulan || 0), 0);
  return {
    rows: rows.rows.map((r) => ({
      month: String(r.month_key),
      pemasukan: Number(r.pemasukan || 0),
      pengeluaran: Number(r.pengeluaran || 0),
      saldo_bulan: Number(r.saldo_bulan || 0)
    })),
    saldo_akhir_2025: total
  };
}

export async function upsertKoperasiIuranMigrationRows({ rows, actorId }) {
  await ensureMigration2025Tables();
  for (const row of rows) {
    const wargaId = String(row.warga_id || '').trim();
    const month = String(row.month || '').trim();
    const amount = Number(row.amount || 0);
    if (!wargaId || !/^(2025)-(0[1-9]|1[0-2])$/.test(month) || !Number.isFinite(amount) || amount < 0) continue;
    await pool.query(
      `INSERT INTO mig_kop_iuran_2025 (warga_id, month_key, amount, created_by, updated_at)
       VALUES ($1::uuid, $2, $3, $4::uuid, NOW())
       ON CONFLICT (warga_id, month_key)
       DO UPDATE SET amount = EXCLUDED.amount, created_by = EXCLUDED.created_by, updated_at = NOW()`,
      [wargaId, month, amount, actorId]
    );
  }
}

export async function getKoperasiIuranMigrationSummary2025() {
  await ensureMigration2025Tables();
  const users = await pool.query(
    `SELECT u.id::text AS warga_id, u.nama
     FROM users u
     WHERE ${ELIGIBLE_USERS_CLAUSE}
     ORDER BY u.nama`
  );
  const agg = await pool.query(
    `SELECT warga_id::text AS warga_id, COALESCE(SUM(amount),0) AS total_paid_2025
     FROM mig_kop_iuran_2025
     GROUP BY warga_id::text`
  );
  const map = new Map(agg.rows.map((r) => [String(r.warga_id), Number(r.total_paid_2025 || 0)]));
  return users.rows.map((u) => ({
    warga_id: String(u.warga_id),
    nama: String(u.nama || ''),
    total_paid_2025: Number(map.get(String(u.warga_id)) || 0)
  }));
}

export async function upsertKoperasiLoanProgress2025({ rows, actorId }) {
  await ensureKoperasiTables();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of rows) {
      const loanKey = String(row.loan_key || '').trim();
      const wargaId = String(row.warga_id || '').trim();
      const principal = Number(row.principal_amount || 0);
      const tenor = Number(row.tenor_months || 0);
      const paidInstallments = Math.max(0, Number(row.paid_installments || 0));
      const interestModel = String(row.interest_model || 'FLAT').toUpperCase() === 'DECLINING' ? 'DECLINING' : 'FLAT';
      const rate = Number(row.interest_rate_monthly || 1);
      const firstDueMonth = String(row.first_due_month || '2025-01').trim();
      if (!loanKey || !wargaId) continue;
      if (!(principal > 0) || !(tenor > 0) || !(rate > 0 && rate <= 2.5)) continue;
      if (!/^(2025|2024|2023|2022|2021|2020)-((0[1-9])|(1[0-2]))$/.test(firstDueMonth)) continue;

      const plan = buildInstallmentPlan({
        principal,
        tenorMonths: tenor,
        interestModel,
        interestRateMonthly: rate,
        firstDueMonth
      });

      const tag = `[MIG2025:${loanKey}]`;
      let loanId = '';
      const findLoan = await client.query(
        `SELECT id::text FROM kop_loans WHERE notes LIKE $1 LIMIT 1`,
        [`${tag}%`]
      );
      if (findLoan.rows.length) {
        loanId = String(findLoan.rows[0].id);
        await client.query(
          `UPDATE kop_loans
           SET principal_amount = $2,
               tenor_months = $3,
               interest_model = $4,
               interest_rate_monthly = $5,
               status = 'ACTIVE',
               updated_at = NOW()
           WHERE id = $1::uuid`,
          [loanId, principal, tenor, interestModel, rate]
        );
        await client.query(`DELETE FROM kop_installments WHERE loan_id = $1::uuid`, [loanId]);
      } else {
        const ins = await client.query(
          `INSERT INTO kop_loans
           (id, warga_id, principal_amount, tenor_months, interest_model, interest_rate_monthly, status, notes, created_by, approved_by, approved_at, disbursed_at)
           VALUES ($8::uuid, $1::uuid, $2, $3, $4, $5, 'ACTIVE', $6, $7::uuid, $7::uuid, NOW(), CURRENT_DATE)
           RETURNING id::text`,
          [wargaId, principal, tenor, interestModel, rate, `${tag} histori pinjaman migrasi 2025`, actorId, randomUUID()]
        );
        loanId = String(ins.rows[0].id);
      }

      const paidNo = Math.min(Math.floor(paidInstallments), plan.length);
      for (const item of plan) {
        const isPaid = item.installment_no <= paidNo;
        await client.query(
          `INSERT INTO kop_installments
           (id, loan_id, installment_no, due_month, due_date, principal_due, interest_due, penalty_due, total_due, paid_principal, paid_interest, paid_penalty, status, created_at, updated_at)
           VALUES ($11::uuid, $1::uuid, $2, $3, $4::date, $5, $6, 0, $7, $8, $9, 0, $10, NOW(), NOW())`,
          [
            loanId,
            item.installment_no,
            item.due_month,
            item.due_date,
            item.principal_due,
            item.interest_due,
            item.total_due,
            isPaid ? item.principal_due : 0,
            isPaid ? item.interest_due : 0,
            isPaid ? 'PAID' : 'PENDING',
            randomUUID()
          ]
        );
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getKoperasiLoanProgressMigrationSummary2025() {
  await ensureKoperasiTables();
  const rs = await pool.query(
    `SELECT
       l.id::text AS loan_id,
       l.warga_id::text AS warga_id,
       u.nama,
       l.principal_amount,
       l.tenor_months,
       COALESCE(SUM(CASE WHEN i.status = 'PAID' THEN 1 ELSE 0 END), 0) AS paid_installments,
       COALESCE(MAX(i.installment_no), 0) AS total_installments
     FROM kop_loans l
     JOIN users u ON u.id = l.warga_id
     LEFT JOIN kop_installments i ON i.loan_id = l.id
     WHERE l.notes LIKE '[MIG2025:%'
     GROUP BY l.id, l.warga_id, u.nama, l.principal_amount, l.tenor_months
     ORDER BY u.nama ASC, l.created_at DESC`
  );
  return rs.rows.map((r) => ({
    loan_id: String(r.loan_id),
    warga_id: String(r.warga_id),
    nama: String(r.nama || ''),
    principal_amount: Number(r.principal_amount || 0),
    tenor_months: Number(r.tenor_months || 0),
    paid_installments: Number(r.paid_installments || 0),
    total_installments: Number(r.total_installments || 0)
  }));
}
