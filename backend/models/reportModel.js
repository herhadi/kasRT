import { pool } from '../db.js';
import { ELIGIBLE_USERS_CLAUSE } from './eligibleUsersSql.js';
import { ensureInternetTables } from './internetModel.js';
import { ensureLingkunganTables } from './lingkunganModel.js';
import { ensureKoperasiTables } from './koperasiModel.js';
import { ensureTabunganTables, getTabunganDanaSummary, getTabunganMigrationBalanceByWarga } from './tabunganModel.js';
import { ensureJimpitanTopupsTable } from './jimpitanModel.js';
import { listFinanceWallets } from './bendaharaModel.js';

let reportTablesEnsured = false;

async function ensureReportTables() {
  if (reportTablesEnsured) return;
  await Promise.all([
    ensureInternetTables(),
    ensureLingkunganTables(),
    ensureKoperasiTables(),
    ensureTabunganTables()
  ]);
  reportTablesEnsured = true;
}

export async function getJimpitanHarianByWarga(userId) {
  const result = await pool.query(
    `SELECT COALESCE(SUM(nominal), 0) AS total
     FROM jimpitan_details
     WHERE warga_id = $1
     AND tanggal = CURRENT_DATE`,
    [userId]
  );
  return Number(result.rows[0]?.total || 0);
}

export async function getJimpitanBulananByWarga(userId, month = null) {
  await ensureJimpitanTopupsTable();
  const monthDate = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ''))
    ? `${month}-01`
    : null;
  const result = await pool.query(
    `WITH month_ref AS (
       SELECT DATE_TRUNC('month', COALESCE($2::date, CURRENT_DATE)) AS month_start
     ),
     detail AS (
       SELECT COALESCE(SUM(nominal), 0) AS total
       FROM jimpitan_details jd
       CROSS JOIN month_ref mr
       WHERE jd.warga_id = $1
         AND DATE_TRUNC('month', jd.tanggal) = mr.month_start
     ),
     topup AS (
       SELECT COALESCE(SUM(nominal), 0) AS total
       FROM jimpitan_topups jt
       CROSS JOIN month_ref mr
       WHERE jt.warga_id = $1
         AND jt.month_key = TO_CHAR(mr.month_start, 'YYYY-MM')
     )
     SELECT (SELECT total FROM detail) + (SELECT total FROM topup) AS total`,
    [userId, monthDate]
  );
  return Number(result.rows[0]?.total || 0);
}

export async function isJimpitanMember(userId) {
  const result = await pool.query(
    `SELECT EXISTS (
       SELECT 1
       FROM jimpitan_members jm
       WHERE jm.warga_id = $1::uuid
         AND jm.status = 'ACTIVE'
     ) AS is_member`,
    [userId]
  );
  return Boolean(result.rows[0]?.is_member);
}

export async function getIuranBulananByWarga(userId, month = null) {
  const monthDate = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ''))
    ? `${month}-01`
    : null;
  const result = await pool.query(
    `SELECT
       ct.name,
       ct.is_mandatory,
       COALESCE(SUM(it.amount), 0) AS total
     FROM contribution_types ct
     LEFT JOIN iuran_transactions it
       ON it.contribution_type_id = ct.id
       AND it.warga_id = $1
       AND DATE_TRUNC('month', it.tanggal) = DATE_TRUNC('month', COALESCE($2::date, CURRENT_DATE))
     GROUP BY ct.id, ct.name, ct.is_mandatory
     ORDER BY ct.is_mandatory DESC, ct.name ASC`,
    [userId, monthDate]
  );
  return result.rows;
}

export async function getLingkunganBulananByWargaByMonthKey(userId, month = null) {
  await ensureReportTables();
  const monthKey = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ''))
    ? String(month)
    : new Date().toISOString().slice(0, 7);
  const result = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM lh_payments
     WHERE warga_id = $1::uuid
       AND month_key = $2`,
    [userId, monthKey]
  );
  return Number(result.rows[0]?.total || 0);
}

export async function getInternetBulananByWargaByMonthKey(userId, month = null) {
  await ensureReportTables();
  const monthKey = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ''))
    ? String(month)
    : new Date().toISOString().slice(0, 7);
  const result = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM inet_payments
     WHERE warga_id = $1::uuid
       AND month_key = $2`,
    [userId, monthKey]
  );
  return Number(result.rows[0]?.total || 0);
}

export async function getKoperasiBulananByWarga(userId, month = null) {
  await ensureReportTables();
  const monthKey = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ''))
    ? String(month)
    : new Date().toISOString().slice(0, 7);
  const result = await pool.query(
    `WITH from_iuran AS (
       SELECT COALESCE(SUM(it.amount), 0) AS total
       FROM iuran_transactions it
       JOIN contribution_types ct ON ct.id = it.contribution_type_id
       WHERE LOWER(TRIM(ct.name)) = 'koperasi'
         AND it.warga_id = $1::uuid
         AND TO_CHAR(it.tanggal, 'YYYY-MM') = $2
     ),
     from_loan_payment AS (
       SELECT COALESCE(SUM(p.amount), 0) AS total
       FROM kop_payments p
       JOIN kop_loans l ON l.id = p.loan_id
       WHERE l.warga_id = $1::uuid
         AND TO_CHAR(p.paid_date, 'YYYY-MM') = $2
     )
     SELECT
       COALESCE((SELECT total FROM from_iuran), 0) +
       COALESCE((SELECT total FROM from_loan_payment), 0) AS total`,
    [userId, monthKey]
  );
  return Number(result.rows[0]?.total || 0);
}

export async function getActiveLoanProgressByWarga(userId) {
  const result = await pool.query(
    `SELECT
       l.id AS loan_id,
       l.tenor_months,
       COALESCE(SUM(i.total_due), 0) AS total_due_all,
       COALESCE(SUM(i.paid_principal + i.paid_interest), 0) AS total_paid_all,
       COALESCE(SUM(CASE WHEN i.status = 'PAID' THEN 1 ELSE 0 END), 0) AS paid_installments,
       COALESCE(
         MIN(CASE WHEN i.status <> 'PAID' THEN i.installment_no END),
         MAX(i.installment_no),
         1
       ) AS current_installment_no
     FROM kop_loans l
     LEFT JOIN kop_installments i ON i.loan_id = l.id
     WHERE l.warga_id = $1::uuid
       AND l.status = 'ACTIVE'
     GROUP BY l.id, l.tenor_months
     ORDER BY l.created_at DESC
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

export async function isInternetMember(userId) {
  await ensureReportTables();
  const result = await pool.query(
    `SELECT EXISTS (
       SELECT 1
       FROM inet_members im
       WHERE im.warga_id = $1::uuid
         AND im.is_active = TRUE
     ) AS is_member`,
    [userId]
  );
  return Boolean(result.rows[0]?.is_member);
}

export async function isLingkunganMember(userId) {
  await ensureReportTables();
  const result = await pool.query(
    `SELECT EXISTS (
       SELECT 1
       FROM lh_members lm
       WHERE lm.warga_id = $1::uuid
         AND lm.is_active = TRUE
     ) AS is_member`,
    [userId]
  );
  return Boolean(result.rows[0]?.is_member);
}

export async function isKoperasiMember(userId) {
  await ensureReportTables();
  const result = await pool.query(
    `SELECT EXISTS (
       SELECT 1
       FROM kop_members km
       WHERE km.warga_id = $1::uuid
         AND km.is_active = TRUE
     ) AS is_member`,
    [userId]
  );
  return Boolean(result.rows[0]?.is_member);
}

export async function isTabunganMember(userId) {
  await ensureReportTables();
  const result = await pool.query(
    `SELECT EXISTS (
       SELECT 1
       FROM tab_savings_members sm
       WHERE sm.warga_id = $1::uuid
         AND sm.is_active = TRUE
     ) AS is_member`,
    [userId]
  );
  return Boolean(result.rows[0]?.is_member);
}

function normalizeMonthKey(month) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || '')) ? String(month) : new Date().toISOString().slice(0, 7);
}

function addMonth(monthKey, delta = 1) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function buildMonthRange(startMonth, endMonth) {
  const start = normalizeMonthKey(startMonth);
  const end = normalizeMonthKey(endMonth);
  const months = [];
  let current = start;
  while (current <= end && months.length < 240) {
    months.push(current);
    current = addMonth(current, 1);
  }
  return months;
}

export async function getMyContributionDetail({ userId, moduleKey, untilMonth }) {
  await ensureReportTables();
  const module = String(moduleKey || '').trim().toLowerCase();
  const endMonth = normalizeMonthKey(untilMonth);
  if (module === 'internet') return getMyRecurringContributionDetail({ userId, moduleKey: 'internet', untilMonth: endMonth });
  if (module === 'lingkungan') return getMyRecurringContributionDetail({ userId, moduleKey: 'lingkungan', untilMonth: endMonth });
  if (module === 'tabungan') return getMyTabunganContributionDetail({ userId, untilMonth: endMonth });
  throw new Error('module invalid');
}

async function getMyRecurringContributionDetail({ userId, moduleKey, untilMonth }) {
  const isInternet = moduleKey === 'internet';
  const memberTable = isInternet ? 'inet_members' : 'lh_members';
  const tariffTable = isInternet ? 'inet_tariffs' : 'lh_tariffs';
  const paymentTable = isInternet ? 'inet_payments' : 'lh_payments';
  const label = isInternet ? 'Internet' : 'Lingkungan';

  const memberRes = await pool.query(
    `SELECT is_active, active_from_month
     FROM ${memberTable}
     WHERE warga_id = $1::uuid
     LIMIT 1`,
    [userId]
  );
  const member = memberRes.rows[0] || {};
  const startMonth = normalizeMonthKey(member.active_from_month || '2026-01');
  const months = buildMonthRange(startMonth, untilMonth);
  const [tariffRes, paymentRes] = await Promise.all([
    pool.query(
      `SELECT effective_month, monthly_fee
       FROM ${tariffTable}
       WHERE effective_month <= $1
       ORDER BY effective_month ASC`,
      [untilMonth]
    ),
    pool.query(
      `SELECT month_key, COALESCE(SUM(amount), 0) AS paid
       FROM ${paymentTable}
       WHERE warga_id = $1::uuid
         AND month_key BETWEEN $2 AND $3
       GROUP BY month_key`,
      [userId, startMonth, untilMonth]
    ),
  ]);

  const tariffs = tariffRes.rows.map((row) => ({
    effective_month: String(row.effective_month),
    monthly_fee: Number(row.monthly_fee || 0)
  }));
  const paidMap = new Map(paymentRes.rows.map((row) => [String(row.month_key), Number(row.paid || 0)]));
  const rows = months.map((month) => {
    const tariff = [...tariffs].reverse().find((item) => item.effective_month <= month);
    const target = Number(tariff?.monthly_fee || 0);
    const paid = Number(paidMap.get(month) || 0);
    const kurang = Math.max(target - paid, 0);
    return {
      kind: 'MONTH',
      period: month,
      description: `Iuran ${label} ${month}`,
      target,
      paid,
      debit: 0,
      credit: paid,
      balance: paid - target,
      status: target <= 0 ? 'INFO' : kurang <= 0 ? (paid > target ? 'LEBIH' : 'LUNAS') : 'TUNGGAK',
      arrears: kurang
    };
  });

  return {
    module_key: moduleKey,
    label,
    is_member: Boolean(member.is_active),
    start_month: startMonth,
    until_month: untilMonth,
    opening_rows: [],
    rows,
    summary: {
      total_target: rows.reduce((sum, row) => sum + Number(row.target || 0), 0),
      total_paid: rows.reduce((sum, row) => sum + Number(row.paid || 0), 0),
      total_arrears: rows.reduce((sum, row) => sum + Number(row.arrears || 0), 0),
      arrears_months: rows.filter((row) => row.status === 'TUNGGAK').length
    }
  };
}

async function getMyTabunganContributionDetail({ userId, untilMonth }) {
  const startMonth = '2026-01';
  const migrationBalance = await getTabunganMigrationBalanceByWarga({ wargaId: userId });
  const months = buildMonthRange(startMonth, untilMonth);
  const [tariffRes, ledgerRes] = await Promise.all([
    pool.query(
      `SELECT effective_month, monthly_fee
       FROM tab_savings_tariffs
       WHERE effective_month <= $1
       ORDER BY effective_month ASC`,
      [untilMonth]
    ),
    pool.query(
      `SELECT
         month_key,
         COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE 0 END), 0) AS credit,
         COALESCE(SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE 0 END), 0) AS debit
       FROM tab_ledger
       WHERE warga_id = $1::uuid
         AND status = 'APPROVED'
         AND month_key <= $2
       GROUP BY month_key`,
      [userId, untilMonth]
    )
  ]);
  const tariffs = tariffRes.rows.map((row) => ({
    effective_month: String(row.effective_month),
    monthly_fee: Number(row.monthly_fee || 0)
  }));
  const ledgerMap = new Map(ledgerRes.rows.map((row) => [String(row.month_key), {
    credit: Number(row.credit || 0),
    debit: Number(row.debit || 0)
  }]));
  let runningBalance = Number(migrationBalance || 0);
  const rows = months.map((month) => {
    const tariff = [...tariffs].reverse().find((item) => item.effective_month <= month);
    const target = Number(tariff?.monthly_fee || 0);
    const movement = ledgerMap.get(month) || { credit: 0, debit: 0 };
    runningBalance += Number(movement.credit || 0) - Number(movement.debit || 0);
    const credit = Number(movement.credit || 0);
    return {
      kind: 'MONTH',
      period: month,
      description: `Tabungan Pembangunan ${month}`,
      target,
      paid: credit,
      debit: Number(movement.debit || 0),
      credit,
      balance: runningBalance,
      status: credit <= 0 ? 'BELUM_SETOR' : target > 0 && credit > target ? 'LEBIH' : 'LUNAS',
      arrears: 0
    };
  });

  return {
    module_key: 'tabungan',
    label: 'Tabungan Pembangunan',
    is_member: await isTabunganMember(userId),
    start_month: startMonth,
    until_month: untilMonth,
    opening_rows: [{
      kind: 'OPENING',
      period: '2025-12',
      description: 'Saldo awal migrasi Desember 2025',
      target: 0,
      paid: Number(migrationBalance || 0),
      debit: 0,
      credit: Number(migrationBalance || 0),
      balance: Number(migrationBalance || 0),
      status: 'MIGRASI',
      arrears: 0
    }],
    rows,
    summary: {
      total_target: rows.reduce((sum, row) => sum + Number(row.target || 0), 0),
      total_paid: rows.reduce((sum, row) => sum + Number(row.paid || 0), 0),
      total_debit: rows.reduce((sum, row) => sum + Number(row.debit || 0), 0),
      ending_balance: runningBalance,
      total_arrears: 0,
      arrears_months: 0
    }
  };
}

export async function getWargaFinancialSnapshot(userId) {
  await ensureReportTables();
  const tabunganMigrasi = await getTabunganMigrationBalanceByWarga({ wargaId: userId });
  const result = await pool.query(
    `WITH iuran_target AS (
       SELECT 30000::numeric AS target
     ),
     iuran_paid AS (
       SELECT COALESCE(SUM(it.amount), 0) AS paid
       FROM iuran_transactions it
       JOIN contribution_types ct ON ct.id = it.contribution_type_id
       WHERE LOWER(TRIM(ct.name)) = 'iuran wajib'
         AND it.warga_id = $1::uuid
         AND DATE_TRUNC('month', it.tanggal) = DATE_TRUNC('month', CURRENT_DATE)
     ),
     tabungan AS (
       SELECT COALESCE(sa.total_balance, 0) AS saldo
       FROM tab_savings_accounts sa
       WHERE sa.warga_id = $1::uuid
     ),
     internet_arrears AS (
       SELECT COALESCE(SUM(GREATEST(mt.target - COALESCE(p.paid,0), 0)), 0) AS total_arrears
            , COALESCE(SUM(CASE WHEN GREATEST(mt.target - COALESCE(p.paid,0), 0) > 0 THEN 1 ELSE 0 END), 0) AS months_arrears
       FROM (
         SELECT TO_CHAR(m, 'YYYY-MM') AS month_key
         FROM generate_series(
           TO_DATE((SELECT COALESCE(MIN(effective_month), TO_CHAR(CURRENT_DATE, 'YYYY-MM')) FROM inet_tariffs), 'YYYY-MM'),
           DATE_TRUNC('month', CURRENT_DATE)::date,
           interval '1 month'
         ) m
       ) mo
       CROSS JOIN LATERAL (
         SELECT COALESCE((
           SELECT t.monthly_fee
           FROM inet_tariffs t
           WHERE t.effective_month <= mo.month_key
           ORDER BY t.effective_month DESC
           LIMIT 1
         ), 60000::numeric) AS target
       ) mt
       LEFT JOIN (
         SELECT month_key, SUM(amount) AS paid
         FROM inet_payments
         WHERE warga_id = $1::uuid
         GROUP BY month_key
       ) p ON p.month_key = mo.month_key
     ),
     lingkungan_arrears AS (
       SELECT COALESCE(SUM(GREATEST(mt.target - COALESCE(p.paid,0), 0)), 0) AS total_arrears
            , COALESCE(SUM(CASE WHEN GREATEST(mt.target - COALESCE(p.paid,0), 0) > 0 THEN 1 ELSE 0 END), 0) AS months_arrears
       FROM (
         SELECT TO_CHAR(m, 'YYYY-MM') AS month_key
         FROM generate_series(
           TO_DATE((SELECT COALESCE(MIN(effective_month), TO_CHAR(CURRENT_DATE, 'YYYY-MM')) FROM lh_tariffs), 'YYYY-MM'),
           DATE_TRUNC('month', CURRENT_DATE)::date,
           interval '1 month'
         ) m
       ) mo
       CROSS JOIN LATERAL (
         SELECT COALESCE((
           SELECT t.monthly_fee
           FROM lh_tariffs t
           WHERE t.effective_month <= mo.month_key
           ORDER BY t.effective_month DESC
           LIMIT 1
         ), 20000::numeric) AS target
       ) mt
       LEFT JOIN (
         SELECT month_key, SUM(amount) AS paid
         FROM lh_payments
         WHERE warga_id = $1::uuid
         GROUP BY month_key
       ) p ON p.month_key = mo.month_key
     )
     SELECT
       GREATEST((SELECT target FROM iuran_target) - (SELECT paid FROM iuran_paid), 0) AS iuran_tunggakan_bulan_ini,
       CASE WHEN GREATEST((SELECT target FROM iuran_target) - (SELECT paid FROM iuran_paid), 0) > 0 THEN 1 ELSE 0 END AS iuran_tunggakan_bulan_count,
       COALESCE((SELECT saldo FROM tabungan LIMIT 1), 0) + $2::numeric AS tabungan_saldo,
       (SELECT total_arrears FROM internet_arrears) AS internet_tunggakan_total,
       (SELECT months_arrears FROM internet_arrears) AS internet_tunggakan_bulan_count,
       (SELECT total_arrears FROM lingkungan_arrears) AS lingkungan_tunggakan_total,
       (SELECT months_arrears FROM lingkungan_arrears) AS lingkungan_tunggakan_bulan_count`,
    [userId, tabunganMigrasi]
  );
  return result.rows[0] || {};
}

export async function getWargaYearlyProgress(userId) {
  await ensureReportTables();
  const result = await pool.query(
    `WITH iuran_ytd AS (
       SELECT COALESCE(SUM(it.amount), 0) AS total
       FROM iuran_transactions it
       JOIN contribution_types ct ON ct.id = it.contribution_type_id
       WHERE LOWER(TRIM(ct.name)) = 'iuran wajib'
         AND it.warga_id = $1::uuid
         AND DATE_TRUNC('year', it.tanggal) = DATE_TRUNC('year', CURRENT_DATE)
     ),
     internet_ytd AS (
       SELECT COALESCE(SUM(amount), 0) AS total
       FROM inet_payments
       WHERE warga_id = $1::uuid
         AND DATE_TRUNC('year', TO_DATE(month_key || '-01', 'YYYY-MM-DD')) = DATE_TRUNC('year', CURRENT_DATE)
     ),
     lingkungan_ytd AS (
       SELECT COALESCE(SUM(amount), 0) AS total
       FROM lh_payments
       WHERE warga_id = $1::uuid
         AND DATE_TRUNC('year', TO_DATE(month_key || '-01', 'YYYY-MM-DD')) = DATE_TRUNC('year', CURRENT_DATE)
     )
     SELECT
       COALESCE((SELECT total FROM iuran_ytd), 0) AS iuran_ytd,
       COALESCE((SELECT total FROM internet_ytd), 0) AS internet_ytd,
       COALESCE((SELECT total FROM lingkungan_ytd), 0) AS lingkungan_ytd`,
    [userId]
  );
  return result.rows[0] || {};
}

export async function getKasUmumSnapshot() {
  await ensureReportTables();
  const [rows, bendaharaWallets] = await Promise.all([
    getFinanceRecapByMonth(new Date().toISOString().slice(0, 7)),
    listFinanceWallets()
  ]);
  const walletMap = new Map(rows.map((r) => [String(r.wallet_name || '').toLowerCase(), Number(r.saldo_akhir || 0)]));
  const kasSosial = Number(walletMap.get('kas sosial') || 0);
  const kasBendahara = (bendaharaWallets || []).reduce((sum, row) => sum + Number(row.balance || 0), 0);

  const [pembangunanDana, sosialOpeningRes, internetRes, lingkunganRes, koperasiRes] = await Promise.all([
    getTabunganDanaSummary(),
    pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM module_opening_balances
       WHERE module_key = 'sosial'
         AND opening_year <= EXTRACT(YEAR FROM CURRENT_DATE)::int`
    ),
    pool.query(
      `SELECT
         COALESCE((SELECT SUM(amount) FROM inet_payments), 0)
         - COALESCE((SELECT SUM(amount) FROM inet_expenses), 0)
         + COALESCE((SELECT SUM(amount) FROM module_opening_balances WHERE module_key = 'internet' AND opening_year <= EXTRACT(YEAR FROM CURRENT_DATE)::int), 0) AS total`
    ),
    pool.query(
      `SELECT
         COALESCE((SELECT SUM(amount) FROM lh_payments), 0)
         - COALESCE((SELECT SUM(amount) FROM lh_expenses), 0)
         + COALESCE((SELECT SUM(amount) FROM module_opening_balances WHERE module_key = 'lingkungan' AND opening_year <= EXTRACT(YEAR FROM CURRENT_DATE)::int), 0) AS total`
    ),
    pool.query(
      `SELECT COALESCE(SUM(
         CASE
           WHEN direction = 'CREDIT' THEN amount
           WHEN direction = 'DEBIT' THEN -amount
           ELSE 0
         END
       ), 0) AS total
       FROM kop_ledger`
    )
  ]);

  return {
    kas_bendahara: Number(kasBendahara || 0),
    kas_sosial: Number(kasSosial || 0) + Number(sosialOpeningRes.rows[0]?.total || 0),
    kas_tabungan_pembangunan: Number(pembangunanDana.total_kas_dana || 0),
    kas_lingkungan: Number(lingkunganRes.rows[0]?.total || 0),
    kas_internet: Number(internetRes.rows[0]?.total || 0),
    kas_koperasi: Number(koperasiRes.rows[0]?.total || 0)
  };
}

export async function getDashboardAdminPembangunanAggregate() {
  const result = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN it.amount > 0 THEN it.amount ELSE 0 END), 0) AS total_setoran_semua_waktu,
       COALESCE(SUM(CASE WHEN it.amount < 0 THEN it.amount ELSE 0 END), 0) AS total_pengeluaran_semua_waktu,
       COALESCE(SUM(it.amount), 0) AS saldo_total,
       COALESCE(SUM(CASE
         WHEN DATE_TRUNC('month', it.tanggal) = DATE_TRUNC('month', CURRENT_DATE) AND it.amount > 0 THEN it.amount
         ELSE 0
       END), 0) AS setoran_bulan_ini,
       COALESCE(SUM(CASE
         WHEN DATE_TRUNC('month', it.tanggal) = DATE_TRUNC('month', CURRENT_DATE) AND it.amount < 0 THEN it.amount
         ELSE 0
       END), 0) AS pengeluaran_bulan_ini
     FROM iuran_transactions it
     JOIN contribution_types ct ON ct.id = it.contribution_type_id
     WHERE ct.name = 'Pembangunan'`
  );
  return result.rows[0] || {};
}

export async function getDashboardAdminInternetAggregate(internetTargetBulanan) {
  await ensureReportTables();
  const result = await pool.query(
    `WITH anggota AS (
       SELECT im.warga_id
       FROM inet_members im
       WHERE im.is_active = TRUE
     ),
     iuran_bulan_ini AS (
       SELECT
         it.warga_id,
         COALESCE(SUM(it.amount), 0) AS total
       FROM iuran_transactions it
       JOIN contribution_types ct ON ct.id = it.contribution_type_id
       WHERE ct.name = 'Internet'
         AND DATE_TRUNC('month', it.tanggal) = DATE_TRUNC('month', CURRENT_DATE)
       GROUP BY it.warga_id
     )
     SELECT
       COUNT(a.warga_id) AS total_anggota,
       COALESCE(SUM(ibi.total), 0) AS pemasukan_bulan_ini,
       COALESCE(SUM(CASE WHEN COALESCE(ibi.total, 0) < $1 THEN 1 ELSE 0 END), 0) AS total_menunggak,
       COALESCE(SUM(CASE WHEN COALESCE(ibi.total, 0) = $1 THEN 1 ELSE 0 END), 0) AS total_pas,
       COALESCE(SUM(CASE WHEN COALESCE(ibi.total, 0) > $1 THEN 1 ELSE 0 END), 0) AS total_lebih
     FROM anggota a
     LEFT JOIN iuran_bulan_ini ibi ON ibi.warga_id = a.warga_id`,
    [internetTargetBulanan]
  );
  return result.rows[0] || {};
}

export async function getDashboardAdminKoperasiAggregate() {
  await ensureReportTables();
  const result = await pool.query(
    `WITH anggota AS (
       SELECT km.warga_id
       FROM kop_members km
       WHERE km.is_active = TRUE
     )
     SELECT
       COALESCE(SUM(CASE
         WHEN DATE_TRUNC('month', it.tanggal) = DATE_TRUNC('month', CURRENT_DATE) THEN it.amount
         ELSE 0
       END), 0) AS total_bulan_ini,
       COALESCE(SUM(it.amount), 0) AS total_semua_waktu,
       (SELECT COUNT(*) FROM anggota) AS total_anggota
     FROM iuran_transactions it
     JOIN contribution_types ct ON ct.id = it.contribution_type_id
     WHERE ct.name = 'Koperasi'`
  );
  return result.rows[0] || {};
}

export async function getDashboardAdminLingkunganAggregate(lingkunganTargetBulanan) {
  await ensureReportTables();
  const result = await pool.query(
    `WITH anggota AS (
       SELECT lm.warga_id
       FROM lh_members lm
       WHERE lm.is_active = TRUE
     ),
     iuran_bulan_ini AS (
       SELECT
         it.warga_id,
         COALESCE(SUM(it.amount), 0) AS total
       FROM iuran_transactions it
       JOIN contribution_types ct ON ct.id = it.contribution_type_id
       WHERE ct.name IN ('Lingkungan', 'Sampah', 'Iuran Sampah')
         AND DATE_TRUNC('month', it.tanggal) = DATE_TRUNC('month', CURRENT_DATE)
       GROUP BY it.warga_id
     )
     SELECT
       COUNT(a.warga_id) AS total_anggota,
       COALESCE(SUM(ibi.total), 0) AS pemasukan_bulan_ini,
       COALESCE(SUM(CASE WHEN COALESCE(ibi.total, 0) < $1 THEN 1 ELSE 0 END), 0) AS total_menunggak,
       COALESCE(SUM(CASE WHEN COALESCE(ibi.total, 0) = $1 THEN 1 ELSE 0 END), 0) AS total_pas,
       COALESCE(SUM(CASE WHEN COALESCE(ibi.total, 0) > $1 THEN 1 ELSE 0 END), 0) AS total_lebih
     FROM anggota a
     LEFT JOIN iuran_bulan_ini ibi ON ibi.warga_id = a.warga_id`,
    [lingkunganTargetBulanan]
  );
  return result.rows[0] || {};
}

export async function getDashboardBendaharaIuranWajibAggregate(iuranWajibTargetBulanan) {
  const result = await pool.query(
    `WITH warga AS (
       SELECT DISTINCT u.id
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE LOWER(TRIM(r.name)) = 'warga'
         AND ${ELIGIBLE_USERS_CLAUSE}
       UNION
       SELECT u2.id
       FROM users u2
       WHERE NOT EXISTS (
         SELECT 1
         FROM users ux
         JOIN user_roles urx ON urx.user_id = ux.id
         JOIN roles rx ON rx.id = urx.role_id
         WHERE LOWER(TRIM(rx.name)) = 'warga'
       )
       AND ${ELIGIBLE_USERS_CLAUSE.replaceAll('u.', 'u2.').replaceAll('urx', 'ur2').replaceAll('rx', 'r2')}
     ),
     bulan_ini AS (
       SELECT
         it.warga_id,
         COALESCE(SUM(it.amount), 0) AS total
       FROM iuran_transactions it
       JOIN contribution_types ct ON ct.id = it.contribution_type_id
       WHERE LOWER(TRIM(ct.name)) = 'iuran wajib'
         AND DATE_TRUNC('month', it.tanggal) = DATE_TRUNC('month', CURRENT_DATE)
       GROUP BY it.warga_id
     ),
     tahun_ini AS (
       SELECT
         it.warga_id,
         COALESCE(SUM(it.amount), 0) AS total
       FROM iuran_transactions it
       JOIN contribution_types ct ON ct.id = it.contribution_type_id
       WHERE LOWER(TRIM(ct.name)) = 'iuran wajib'
         AND DATE_TRUNC('year', it.tanggal) = DATE_TRUNC('year', CURRENT_DATE)
       GROUP BY it.warga_id
     ),
     base AS (
       SELECT
         w.id AS warga_id,
         COALESCE(bi.total, 0) AS iuran_bulan_ini,
         COALESCE(ti.total, 0) AS iuran_tahun_ini
       FROM warga w
       LEFT JOIN bulan_ini bi ON bi.warga_id = w.id
       LEFT JOIN tahun_ini ti ON ti.warga_id = w.id
     )
     SELECT
       COUNT(*) AS total_warga,
       COALESCE(SUM(iuran_bulan_ini), 0) AS pemasukan_bulan_ini,
       COALESCE(SUM(CASE WHEN iuran_bulan_ini < $1 THEN 1 ELSE 0 END), 0) AS total_menunggak_bulan_ini,
       COALESCE(SUM(CASE WHEN iuran_bulan_ini = $1 THEN 1 ELSE 0 END), 0) AS total_pas_bulan_ini,
       COALESCE(SUM(CASE WHEN iuran_bulan_ini > $1 THEN 1 ELSE 0 END), 0) AS total_lebih_bulan_ini,
       COALESCE(SUM(CASE WHEN iuran_bulan_ini < $1 THEN ($1 - iuran_bulan_ini) ELSE 0 END), 0) AS nominal_tunggakan_bulan_ini,
       COALESCE(SUM(
         GREATEST((EXTRACT(MONTH FROM CURRENT_DATE)::int * $1) - iuran_tahun_ini, 0)
       ), 0) AS nominal_tunggakan_akumulatif_tahun_berjalan
     FROM base`,
    [iuranWajibTargetBulanan]
  );
  return result.rows[0] || {};
}

export async function getTop10PenunggakIuranWajib(iuranWajibTargetBulanan) {
  const result = await pool.query(
    `WITH warga AS (
       SELECT DISTINCT u.id, u.nama, u.no_hp
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE LOWER(TRIM(r.name)) = 'warga'
         AND ${ELIGIBLE_USERS_CLAUSE}
       UNION
       SELECT u2.id, u2.nama, u2.no_hp
       FROM users u2
       WHERE NOT EXISTS (
         SELECT 1
         FROM users ux
         JOIN user_roles urx ON urx.user_id = ux.id
         JOIN roles rx ON rx.id = urx.role_id
         WHERE LOWER(TRIM(rx.name)) = 'warga'
       )
       AND ${ELIGIBLE_USERS_CLAUSE.replaceAll('u.', 'u2.').replaceAll('urx', 'ur2').replaceAll('rx', 'r2')}
     ),
     iuran_bulan_ini AS (
       SELECT it.warga_id, COALESCE(SUM(it.amount), 0) AS total
       FROM iuran_transactions it
       JOIN contribution_types ct ON ct.id = it.contribution_type_id
       WHERE LOWER(TRIM(ct.name)) = 'iuran wajib'
         AND DATE_TRUNC('month', it.tanggal) = DATE_TRUNC('month', CURRENT_DATE)
       GROUP BY it.warga_id
     ),
     iuran_tahun_ini AS (
       SELECT it.warga_id, COALESCE(SUM(it.amount), 0) AS total
       FROM iuran_transactions it
       JOIN contribution_types ct ON ct.id = it.contribution_type_id
       WHERE LOWER(TRIM(ct.name)) = 'iuran wajib'
         AND DATE_TRUNC('year', it.tanggal) = DATE_TRUNC('year', CURRENT_DATE)
       GROUP BY it.warga_id
     )
     SELECT
       w.id AS warga_id,
       w.nama,
       w.no_hp,
       COALESCE(ib.total, 0) AS iuran_bulan_ini,
       GREATEST($1 - COALESCE(ib.total, 0), 0) AS tunggakan_bulan_ini,
       COALESCE(iy.total, 0) AS iuran_tahun_ini,
       GREATEST((EXTRACT(MONTH FROM CURRENT_DATE)::int * $1) - COALESCE(iy.total, 0), 0) AS tunggakan_akumulatif
     FROM warga w
     LEFT JOIN iuran_bulan_ini ib ON ib.warga_id = w.id
     LEFT JOIN iuran_tahun_ini iy ON iy.warga_id = w.id
     WHERE GREATEST((EXTRACT(MONTH FROM CURRENT_DATE)::int * $1) - COALESCE(iy.total, 0), 0) > 0
     ORDER BY tunggakan_akumulatif DESC, w.nama ASC
     LIMIT 10`,
    [iuranWajibTargetBulanan]
  );
  return result.rows;
}

export async function getTrenIuranWajib6Bulan(iuranWajibTargetBulanan) {
  const result = await pool.query(
    `WITH warga AS (
       SELECT DISTINCT u.id
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE LOWER(TRIM(r.name)) = 'warga'
         AND ${ELIGIBLE_USERS_CLAUSE}
       UNION
       SELECT u2.id
       FROM users u2
       WHERE NOT EXISTS (
         SELECT 1
         FROM users ux
         JOIN user_roles urx ON urx.user_id = ux.id
         JOIN roles rx ON rx.id = urx.role_id
         WHERE LOWER(TRIM(rx.name)) = 'warga'
       )
       AND ${ELIGIBLE_USERS_CLAUSE.replaceAll('u.', 'u2.').replaceAll('urx', 'ur2').replaceAll('rx', 'r2')}
     ),
     months AS (
       SELECT DATE_TRUNC('month', CURRENT_DATE) - (g.n * INTERVAL '1 month') AS month_start
       FROM generate_series(5, 0, -1) AS g(n)
     ),
     iuran_monthly AS (
       SELECT
         DATE_TRUNC('month', it.tanggal)::date AS month_start,
         COALESCE(SUM(it.amount), 0) AS total
       FROM iuran_transactions it
       JOIN contribution_types ct ON ct.id = it.contribution_type_id
       WHERE LOWER(TRIM(ct.name)) = 'iuran wajib'
         AND it.tanggal >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'
         AND it.tanggal < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
       GROUP BY DATE_TRUNC('month', it.tanggal)::date
     ),
     warga_count AS (
       SELECT COUNT(*) AS total_warga FROM warga
     )
     SELECT
       TO_CHAR(m.month_start, 'YYYY-MM') AS bulan,
       COALESCE(wc.total_warga, 0) AS total_warga,
       (COALESCE(wc.total_warga, 0) * $1) AS target,
       COALESCE(im.total, 0) AS pemasukan,
       GREATEST((COALESCE(wc.total_warga, 0) * $1) - COALESCE(im.total, 0), 0) AS tunggakan
     FROM months m
     CROSS JOIN warga_count wc
     LEFT JOIN iuran_monthly im ON im.month_start = m.month_start::date
     ORDER BY m.month_start ASC`,
    [iuranWajibTargetBulanan]
  );
  return result.rows;
}

export async function getLaporanBulananByMonth(bulan) {
  const result = await pool.query(
    `SELECT
       type,
       SUM(amount) AS total
     FROM transactions
     WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', $1::date)
     AND status = 'APPROVED'
     GROUP BY type`,
    [`${bulan}-01`]
  );
  return result.rows;
}

export async function getDashboardAdminSosialByMonth(month) {
  const monthStart = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ''))
    ? `${month}-01`
    : new Date().toISOString().slice(0, 7) + '-01';

  const summaryResult = await pool.query(
    `WITH kas_sosial AS (
       SELECT id
       FROM wallets
       WHERE LOWER(name) = LOWER('Kas Sosial')
       LIMIT 1
     ),
     social_opening AS (
       SELECT COALESCE(SUM(amount), 0) AS amount
       FROM module_opening_balances
       WHERE module_key = 'sosial'
         AND opening_year <= EXTRACT(YEAR FROM CURRENT_DATE)::int
     ),
     baseline AS (
       SELECT
         ks.id AS wallet_id,
         y.year,
         CASE
           WHEN y.wallet_id IS NULL THEN 0::numeric
           WHEN UPPER(COALESCE(ap.status, 'OPEN')) = 'CLOSED' THEN COALESCE(y.closing_balance, 0)
           ELSE COALESCE(y.opening_balance, 0)
         END AS base_balance,
         so.amount AS social_opening_balance,
         MAKE_DATE(
           CASE
             WHEN y.wallet_id IS NULL THEN EXTRACT(YEAR FROM CURRENT_DATE)::int
             WHEN UPPER(COALESCE(ap.status, 'OPEN')) = 'CLOSED' THEN y.year + 1
             ELSE y.year
           END,
           1,
           1
         ) AS baseline_date
       FROM kas_sosial ks
       CROSS JOIN social_opening so
       LEFT JOIN LATERAL (
         SELECT yy.wallet_id, yy.year, yy.opening_balance, yy.closing_balance
         FROM yearly_wallet_balances yy
         WHERE yy.wallet_id = ks.id
         ORDER BY yy.year DESC
         LIMIT 1
       ) y ON TRUE
       LEFT JOIN accounting_periods ap ON ap.year = y.year
     )
     SELECT
       COALESCE(b.base_balance, 0) + COALESCE(b.social_opening_balance, 0) + COALESCE((
         SELECT SUM(
           CASE
             WHEN t.status = 'APPROVED' AND t.target_wallet_id = b.wallet_id AND t.type IN ('IN', 'TRANSFER') THEN t.amount
             WHEN t.status = 'APPROVED' AND t.source_wallet_id = b.wallet_id AND t.type IN ('OUT', 'TRANSFER') THEN -t.amount
             ELSE 0
           END
         )
         FROM transactions t
         WHERE (t.target_wallet_id = b.wallet_id OR t.source_wallet_id = b.wallet_id)
           AND t.created_at >= b.baseline_date
       ), 0) AS saldo_total,
       COALESCE((
         SELECT SUM(t.amount)
         FROM transactions t
         WHERE t.status = 'APPROVED'
           AND t.target_wallet_id = b.wallet_id
           AND t.type IN ('IN', 'TRANSFER')
           AND DATE_TRUNC('month', t.created_at) = DATE_TRUNC('month', $1::date)
       ), 0) + COALESCE((
         SELECT SUM(amount)
         FROM module_opening_balances
         WHERE module_key = 'sosial'
           AND opening_year = EXTRACT(YEAR FROM $1::date)::int
           AND DATE_TRUNC('month', MAKE_DATE(opening_year, 1, 1)) = DATE_TRUNC('month', $1::date)
       ), 0) AS pemasukan_bulan,
       COALESCE((
         SELECT SUM(t.amount)
         FROM transactions t
         WHERE t.status = 'APPROVED'
           AND t.source_wallet_id = b.wallet_id
           AND t.type = 'OUT'
           AND DATE_TRUNC('month', t.created_at) = DATE_TRUNC('month', $1::date)
       ), 0) AS pengeluaran_bulan
     FROM baseline b`,
    [monthStart]
  );

  const expenseRows = await pool.query(
    `WITH kas_sosial AS (
       SELECT id
       FROM wallets
       WHERE LOWER(name) = LOWER('Kas Sosial')
       LIMIT 1
     )
     SELECT
       t.id,
       t.amount,
       t.status,
       t.description,
       t.created_at,
       u.nama AS created_by_nama
     FROM transactions t
     LEFT JOIN users u ON u.id::text = t.created_by::text
     CROSS JOIN kas_sosial ks
     WHERE t.type = 'OUT'
       AND t.source_wallet_id = ks.id
       AND DATE_TRUNC('month', t.created_at) = DATE_TRUNC('month', $1::date)
     ORDER BY t.created_at DESC
     LIMIT 100`,
    [monthStart]
  );

  const incomeRows = await pool.query(
    `WITH kas_sosial AS (
       SELECT id
       FROM wallets
       WHERE LOWER(name) = LOWER('Kas Sosial')
       LIMIT 1
     )
     SELECT
       id,
       amount,
       status,
       description,
       created_at,
       created_by_nama,
       source_wallet_name
     FROM (
       SELECT
         t.id::text AS id,
         t.amount,
         t.status,
         REPLACE(COALESCE(t.description, ''), '[SOCIAL_RECEIPT] ', '') AS description,
         t.created_at,
         u.nama AS created_by_nama,
         sw.name AS source_wallet_name
       FROM transactions t
       LEFT JOIN users u ON u.id::text = t.created_by::text
       LEFT JOIN wallets sw ON sw.id = t.source_wallet_id
       CROSS JOIN kas_sosial ks
       WHERE t.status = 'APPROVED'
         AND t.target_wallet_id = ks.id
         AND t.type IN ('IN', 'TRANSFER')
       UNION ALL
       SELECT
         'opening-sosial-' || closing_year::text AS id,
         amount,
         'APPROVED' AS status,
         'Saldo awal migrasi Desember ' || closing_year::text AS description,
         MAKE_DATE(opening_year, 1, 1)::timestamptz AS created_at,
         NULL::text AS created_by_nama,
         'Migrasi ' || closing_year::text AS source_wallet_name
       FROM module_opening_balances
       WHERE module_key = 'sosial'
     ) income_src
     ORDER BY created_at DESC
     LIMIT 100`,
    []
  );

  const openingBalanceRows = await pool.query(
    `SELECT
       'opening-sosial-' || closing_year::text AS id,
       closing_year,
       opening_year,
       amount,
       created_at,
       updated_at
     FROM module_opening_balances
     WHERE module_key = 'sosial'
     ORDER BY opening_year DESC, closing_year DESC`
  );

  return {
    summary: summaryResult.rows[0] || {},
    incomes: incomeRows.rows,
    expenses: expenseRows.rows,
    opening_balances: openingBalanceRows.rows.map((row) => ({
      id: String(row.id),
      closing_year: Number(row.closing_year || 0),
      opening_year: Number(row.opening_year || 0),
      amount: Number(row.amount || 0),
      created_at: row.created_at,
      updated_at: row.updated_at
    }))
  };
}

export async function getFinanceRecapByMonth(month) {
  const monthStart = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ''))
    ? `${month}-01`
    : new Date().toISOString().slice(0, 7) + '-01';

  const rows = await pool.query(
    `SELECT
       w.id::text AS wallet_id,
       w.name AS wallet_name,
       (
         COALESCE(
           CASE
             WHEN y.wallet_id IS NULL THEN 0
             WHEN UPPER(COALESCE(ap.status, 'OPEN')) = 'CLOSED' THEN COALESCE(y.closing_balance, 0)
             ELSE COALESCE(y.opening_balance, 0)
           END,
           0
         ) + COALESCE(mutasi_after_baseline.total_mutasi, 0)
       ) AS saldo_akhir,
       COALESCE(month_in.total_in, 0) AS pemasukan_bulan,
       COALESCE(month_out.total_out, 0) AS pengeluaran_bulan
     FROM wallets w
     LEFT JOIN LATERAL (
       SELECT yy.wallet_id, yy.year, yy.opening_balance, yy.closing_balance
       FROM yearly_wallet_balances yy
       WHERE yy.wallet_id = w.id
       ORDER BY yy.year DESC
       LIMIT 1
     ) y ON TRUE
     LEFT JOIN accounting_periods ap ON ap.year = y.year
     LEFT JOIN LATERAL (
       SELECT SUM(
         CASE
           WHEN t.status = 'APPROVED' AND t.target_wallet_id = w.id AND t.type IN ('IN', 'TRANSFER') THEN t.amount
           WHEN t.status = 'APPROVED' AND t.source_wallet_id = w.id AND t.type IN ('OUT', 'TRANSFER') THEN -t.amount
           ELSE 0
         END
       ) AS total_mutasi
       FROM transactions t
       WHERE (t.target_wallet_id = w.id OR t.source_wallet_id = w.id)
         AND t.created_at >= MAKE_DATE(
           CASE
             WHEN y.wallet_id IS NULL THEN EXTRACT(YEAR FROM CURRENT_DATE)::int
             WHEN UPPER(COALESCE(ap.status, 'OPEN')) = 'CLOSED' THEN y.year + 1
             ELSE y.year
           END,
           1,
           1
         )
     ) mutasi_after_baseline ON TRUE
     LEFT JOIN LATERAL (
       SELECT SUM(t.amount) AS total_in
       FROM transactions t
       WHERE t.status = 'APPROVED'
         AND t.target_wallet_id = w.id
         AND t.type IN ('IN', 'TRANSFER')
         AND DATE_TRUNC('month', t.created_at) = DATE_TRUNC('month', $1::date)
     ) month_in ON TRUE
     LEFT JOIN LATERAL (
       SELECT SUM(t.amount) AS total_out
       FROM transactions t
       WHERE t.status = 'APPROVED'
         AND t.source_wallet_id = w.id
         AND t.type IN ('OUT', 'TRANSFER')
         AND DATE_TRUNC('month', t.created_at) = DATE_TRUNC('month', $1::date)
     ) month_out ON TRUE
     ORDER BY w.name ASC`,
    [monthStart]
  );

  return rows.rows;
}

export async function getTotalKasSemuaTerkini() {
  const result = await pool.query(
    `SELECT
       COALESCE(SUM(
         COALESCE(
           CASE
             WHEN y.wallet_id IS NULL THEN 0
             WHEN UPPER(COALESCE(ap.status, 'OPEN')) = 'CLOSED' THEN COALESCE(y.closing_balance, 0)
             ELSE COALESCE(y.opening_balance, 0)
           END,
           0
         ) + COALESCE(mutasi_after_baseline.total_mutasi, 0)
       ), 0) AS total_kas_semua
     FROM wallets w
     LEFT JOIN LATERAL (
       SELECT yy.wallet_id, yy.year, yy.opening_balance, yy.closing_balance
       FROM yearly_wallet_balances yy
       WHERE yy.wallet_id = w.id
       ORDER BY yy.year DESC
       LIMIT 1
     ) y ON TRUE
     LEFT JOIN accounting_periods ap ON ap.year = y.year
     LEFT JOIN LATERAL (
       SELECT SUM(
         CASE
           WHEN t.status = 'APPROVED' AND t.target_wallet_id = w.id AND t.type IN ('IN', 'TRANSFER') THEN t.amount
           WHEN t.status = 'APPROVED' AND t.source_wallet_id = w.id AND t.type IN ('OUT', 'TRANSFER') THEN -t.amount
           ELSE 0
         END
       ) AS total_mutasi
       FROM transactions t
       WHERE (t.target_wallet_id = w.id OR t.source_wallet_id = w.id)
         AND t.created_at >= MAKE_DATE(
           CASE
             WHEN y.wallet_id IS NULL THEN EXTRACT(YEAR FROM CURRENT_DATE)::int
             WHEN UPPER(COALESCE(ap.status, 'OPEN')) = 'CLOSED' THEN y.year + 1
             ELSE y.year
           END,
           1,
           1
         )
     ) mutasi_after_baseline ON TRUE`,
  );

  return Number(result.rows[0]?.total_kas_semua || 0);
}
