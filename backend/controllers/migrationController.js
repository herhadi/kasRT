import {
  listInternetMigrationMembers2025,
  listLingkunganMigrationMembers2025,
  applyOpeningArrears2026FromMigrationIuran,
  upsertInternetMigrationRows,
  upsertJimpitanMigrationRows,
  upsertKoperasiIuranMigrationRows,
  upsertKoperasiLoanProgress2025,
  upsertLingkunganMigrationRows,
  upsertSosialMigrationRows,
  upsertTabunganMigrationRows,
  upsertIuranWajib2025Rows,
  MIGRATION_MONTH_KEYS_FOR_YEAR,
  ensureMigrationTablesForYear,
  getModuleMigrationOpeningBalance,
  upsertModuleMigrationOpeningBalance,
  MIGRATION_MONTH_KEYS_2025
} from '../models/migration2025Model.js';
import { pool } from '../db.js';
import { ELIGIBLE_USERS_CLAUSE } from '../models/eligibleUsersSql.js';

function readWargaId(req, res) {
  const wargaId = String(req.query.warga_id || '').trim();
  if (!wargaId) {
    res.status(400).json({ success: false, message: 'warga_id wajib diisi' });
    return null;
  }
  return wargaId;
}

function parseYearParam(req) {
  const p = String(req.params?.year || req.query?.year || '2025');
  const y = Number(p || 2025);
  return Number.isFinite(y) && y > 1900 && y < 3000 ? y : 2025;
}

function readOpeningModule(req) {
  const moduleKey = String(req.params?.module || '').trim().toLowerCase();
  if (!['internet', 'lingkungan'].includes(moduleKey)) throw new Error('Modul saldo awal tidak valid');
  return moduleKey;
}

export async function getMigrationModuleOpeningBalance(req, res) {
  try {
    const closingYear = parseYearParam(req);
    const data = await getModuleMigrationOpeningBalance({ moduleKey: readOpeningModule(req), closingYear });
    return res.json({ success: true, data: { closing_year: closingYear, ...data } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function saveMigrationModuleOpeningBalance(req, res) {
  const actorId = String(req.user?.user_id || '').trim();
  const amount = Number(req.body?.amount || 0);
  if (!actorId) return res.status(401).json({ success: false, message: 'User tidak valid' });
  if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ success: false, message: 'Nominal saldo awal tidak valid' });
  try {
    const closingYear = parseYearParam(req);
    const data = await upsertModuleMigrationOpeningBalance({ moduleKey: readOpeningModule(req), closingYear, amount, actorId });
    return res.json({ success: true, data: { closing_year: closingYear, ...data } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function getMigration2025IuranSummary(_req, res) {
  try {
    const year = parseYearParam(_req);
    await ensureMigrationTablesForYear(year);
    // load tariffs for year
    const tarRs = await pool.query(`SELECT effective_month, monthly_fee FROM iw_tariffs WHERE effective_month <= $1 ORDER BY effective_month ASC`, [`${year}-12`]);
    const tariffs = tarRs.rows.map((r) => ({ month: String(r.effective_month), fee: Number(r.monthly_fee) }));
    const months = MIGRATION_MONTH_KEYS_FOR_YEAR(year);

    // users eligible
    const usersRs = await pool.query(`SELECT u.id::text AS warga_id, u.nama FROM users u WHERE ${ELIGIBLE_USERS_CLAUSE} ORDER BY u.nama`);

    // paid amounts per warga
    const paidRs = await pool.query(`SELECT m.warga_id::text AS warga_id, COALESCE(SUM(m.paid_amount),0) AS total_paid FROM mig_iuran_wajib_${year} m GROUP BY m.warga_id::text`);
    const paidMap = new Map(paidRs.rows.map((r) => [String(r.warga_id), Number(r.total_paid || 0)]));

    // earliest month with data per warga
    const firstRs = await pool.query(`SELECT m.warga_id::text AS warga_id, MIN(m.month) AS first_month FROM mig_iuran_wajib_${year} m WHERE (COALESCE(m.target_amount,0) > 0 OR COALESCE(m.paid_amount,0) > 0) GROUP BY m.warga_id::text`);
    const firstMap = new Map(firstRs.rows.map((r) => [String(r.warga_id), String(r.first_month)]));

    const rows = usersRs.rows.map((u) => {
      const wargaId = String(u.warga_id);
      const nama = String(u.nama || '');
      const activeFrom = firstMap.get(wargaId) || `${year}-01`;
      // compute total target from activeFrom to end of year
      let totalTarget = 0;
      for (const m of months) {
        if (m >= activeFrom) {
          let fee = 30000;
          for (const t of tariffs) if (t.month <= m) fee = t.fee;
          totalTarget += fee;
        }
      }
      const totalPaid = Number(paidMap.get(wargaId) || 0);
      const closing = Math.max(totalTarget - totalPaid, 0);
      const ty = String(year);
      return {
        warga_id: wargaId,
        nama,
        ['total_target_' + ty]: totalTarget,
        ['total_paid_' + ty]: totalPaid,
        ['closing_arrears_' + ty]: closing
      };
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function getMigration2025IuranTariffs(_req, res) {
  try {
    const year = parseYearParam(_req);
    const rs = await pool.query(`SELECT effective_month, monthly_fee FROM iw_tariffs WHERE effective_month <= $1 ORDER BY effective_month ASC`, [`${year}-12`]);
    const tariffs = rs.rows.map((r) => ({ month: String(r.effective_month), fee: Number(r.monthly_fee) }));
    const keys = MIGRATION_MONTH_KEYS_FOR_YEAR(year);
    const months = keys.map((m) => {
      let fee = 30000;
      for (const t of tariffs) if (t.month <= m) fee = t.fee;
      return { month: m, amount: fee };
    });
    return res.json({ success: true, data: { months } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function getMigration2025IuranWargaDetail(req, res) {
  const wargaId = readWargaId(req, res);
  if (!wargaId) return;
  try {
    const year = parseYearParam(req);
    await ensureMigrationTablesForYear(year);
    const rs = await pool.query(
      `SELECT month, target_amount, paid_amount
       FROM mig_iuran_wajib_${year}
       WHERE warga_id = $1::uuid
       ORDER BY month ASC`,
      [wargaId]
    );
    const rows = rs.rows.map((r) => ({ month: String(r.month), target_amount: Number(r.target_amount || 0), paid_amount: Number(r.paid_amount || 0) }));
    return res.json({ success: true, data: { warga_id: wargaId, months: rows } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function saveMigration2025Iuran(req, res) {
  const actorId = String(req.user?.user_id || '').trim();
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!actorId) return res.status(401).json({ success: false, message: 'User tidak valid' });
  if (!rows.length) return res.status(400).json({ success: false, message: 'rows wajib diisi' });
  try {
    const year = parseYearParam(req);
    await upsertIuranWajib2025Rows({ rows, actorId, year });
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function applyMigration2025Opening2026(req, res) {
  const actorId = String(req.user?.user_id || '').trim();
  if (!actorId) return res.status(401).json({ success: false, message: 'User tidak valid' });
  try {
    const year = parseYearParam(req);
    const nextYear = Number(req.params?.nextYear || (year + 1));
    if (!Number.isFinite(nextYear) || nextYear <= year) return res.status(400).json({ success: false, message: 'next year tidak valid' });
    // find contribution type id for Iuran Wajib
    const typeRs = await pool.query(`SELECT id FROM contribution_types WHERE LOWER(TRIM(name))='iuran wajib' LIMIT 1`);
    if (!typeRs.rows.length) throw new Error('Contribution type Iuran Wajib tidak ditemukan');
    const contributionTypeId = Number(typeRs.rows[0].id);

    await pool.query(
      `INSERT INTO yearly_warga_contribution_arrears
       (year, warga_id, contribution_type_id, opening_arrears, updated_at)
       SELECT
         $1::int AS year,
         s.warga_id::uuid AS warga_id,
         $2::int AS contribution_type_id,
         s.closing_arrears AS opening_arrears,
         NOW()
       FROM (
         SELECT m.warga_id::text AS warga_id, GREATEST(COALESCE(SUM(m.target_amount),0) - COALESCE(SUM(m.paid_amount),0), 0) AS closing_arrears
         FROM mig_iuran_wajib_${year} m
         GROUP BY m.warga_id::text
       ) s
       ON CONFLICT (year, warga_id, contribution_type_id)
       DO UPDATE SET opening_arrears = EXCLUDED.opening_arrears, updated_at = NOW()`,
      [nextYear, contributionTypeId]
    );
    return res.json({ success: true, message: `Opening arrears ${nextYear} berhasil dibangun dari closing ${year}.` });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function getMigration2025InternetSummary(_req, res) {
  try {
    const year = parseYearParam(_req);
    await ensureMigrationTablesForYear(year);
    // build tariffs
    const tarRs = await pool.query(`SELECT effective_month, monthly_fee FROM inet_tariffs WHERE effective_month <= $1 ORDER BY effective_month ASC`, [`${year}-12`]);
    const tariffs = tarRs.rows.map((r) => ({ month: String(r.effective_month), fee: Number(r.monthly_fee) }));
    const months = MIGRATION_MONTH_KEYS_FOR_YEAR(year);
    const members = await listInternetMigrationMembers2025();

    const paidAgg = await pool.query(`SELECT warga_id::text AS warga_id, COALESCE(SUM(amount),0) AS total_paid FROM mig_inet_payments_${year} GROUP BY warga_id::text`);
    const paidMap = new Map(paidAgg.rows.map((r) => [String(r.warga_id), Number(r.total_paid || 0)]));

    const firstAgg = await pool.query(`SELECT warga_id::text AS warga_id, MIN(month_key) AS first_month FROM mig_inet_payments_${year} GROUP BY warga_id::text`);
    const firstMap = new Map(firstAgg.rows.map((r) => [String(r.warga_id), String(r.first_month)]));

    const rows = members.map((u) => {
      const wargaId = String(u.warga_id || u.id);
      const activeFrom = firstMap.get(wargaId) || `${year}-01`;
      let totalTarget = 0;
      for (const m of months) {
        if (m >= activeFrom) {
          let fee = 60000;
          for (const t of tariffs) if (t.month <= m) fee = t.fee;
          totalTarget += fee;
        }
      }
      const totalPaid = Number(paidMap.get(wargaId) || 0);
      const ty = String(year);
      return {
        warga_id: wargaId,
        nama: String(u.nama || ''),
        ['total_target_' + ty]: totalTarget,
        ['total_paid_' + ty]: totalPaid,
        ['closing_arrears_' + ty]: Math.max(totalTarget - totalPaid, 0)
      };
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function getMigration2025InternetTariffs(_req, res) {
  try {
    const year = parseYearParam(_req);
    const rs = await pool.query(`SELECT effective_month, monthly_fee FROM inet_tariffs WHERE effective_month <= $1 ORDER BY effective_month ASC`, [`${year}-12`]);
    const tariffs = rs.rows.map((r) => ({ month: String(r.effective_month), fee: Number(r.monthly_fee) }));
    const keys = MIGRATION_MONTH_KEYS_FOR_YEAR(year);
    const months = keys.map((m) => {
      let fee = 60000;
      for (const t of tariffs) if (t.month <= m) fee = t.fee;
      return { month: m, amount: fee };
    });
    return res.json({ success: true, data: { months } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function getMigration2025InternetMembers(_req, res) {
  try {
    const year = parseYearParam(_req);
    await ensureMigrationTablesForYear(year);
    const rows = await listInternetMigrationMembers2025();
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function getMigration2025InternetWargaDetail(req, res) {
  const wargaId = readWargaId(req, res);
  if (!wargaId) return;
  try {
    const year = parseYearParam(req);
    await ensureMigrationTablesForYear(year);
    const rs = await pool.query(
      `SELECT month_key, amount
       FROM mig_inet_payments_${year}
       WHERE warga_id = $1::uuid
       ORDER BY month_key ASC`,
      [wargaId]
    );
    const data = { warga_id: wargaId, months: rs.rows.map((r) => ({ month: String(r.month_key), amount: Number(r.amount || 0) })) };
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function saveMigration2025Internet(req, res) {
  const actorId = String(req.user?.user_id || '').trim();
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!actorId) return res.status(401).json({ success: false, message: 'User tidak valid' });
  if (!rows.length) return res.status(400).json({ success: false, message: 'rows wajib diisi' });
  try {
    const year = parseYearParam(req);
    await upsertInternetMigrationRows({ rows, actorId, year });
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function getMigration2025LingkunganSummary(_req, res) {
  try {
    const year = parseYearParam(_req);
    await ensureMigrationTablesForYear(year);
    const tarRs = await pool.query(`SELECT effective_month, monthly_fee FROM lh_tariffs WHERE effective_month <= $1 ORDER BY effective_month ASC`, [`${year}-12`]);
    const tariffs = tarRs.rows.map((r) => ({ month: String(r.effective_month), fee: Number(r.monthly_fee) }));
    const months = MIGRATION_MONTH_KEYS_FOR_YEAR(year);
    const membersRs = await pool.query(`SELECT u.id::text AS warga_id, u.nama, '2025-01' AS active_from_month FROM users u ORDER BY u.nama`);
    const paidRows = await pool.query(`SELECT warga_id::text AS warga_id, month_key, amount FROM mig_lh_payments_${year}`);
    const paidMap = new Map(paidRows.rows.map((r) => [`${r.warga_id}#${r.month_key}`, Number(r.amount || 0)]));
    const rows = membersRs.rows.map((u) => {
      const wargaId = String(u.warga_id || u.id);
      const activeFromMonth = String(u.active_from_month || `${year}-01`).slice(0,7);
      let target = 0;
      months.forEach((m) => { if (m >= activeFromMonth) {
        let fee = 20000; for (const t of tariffs) if (t.month <= m) fee = t.fee; target += fee;
      }});
      let paid = 0;
      months.forEach((m) => { if (m >= activeFromMonth) paid += Number(paidMap.get(`${wargaId}#${m}`) || 0); });
      const ty = String(year);
      return { warga_id: wargaId, nama: String(u.nama || ''), ['total_target_' + ty]: target, ['total_paid_' + ty]: paid, ['closing_arrears_' + ty]: Math.max(target - paid, 0) };
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function getMigration2025LingkunganTariffs(_req, res) {
  try {
    const year = parseYearParam(_req);
    const rs = await pool.query(`SELECT effective_month, monthly_fee FROM lh_tariffs WHERE effective_month <= $1 ORDER BY effective_month ASC`, [`${year}-12`]);
    const tariffs = rs.rows.map((r) => ({ month: String(r.effective_month), fee: Number(r.monthly_fee) }));
    const keys = MIGRATION_MONTH_KEYS_FOR_YEAR(year);
    const months = keys.map((m) => { let fee = 20000; for (const t of tariffs) if (t.month <= m) fee = t.fee; return { month: m, amount: fee }; });
    return res.json({ success: true, data: { months } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function getMigration2025LingkunganMembers(_req, res) {
  try {
    const year = parseYearParam(_req);
    await ensureMigrationTablesForYear(year);
    const rows = await listLingkunganMigrationMembers2025();
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function getMigration2025LingkunganWargaDetail(req, res) {
  const wargaId = readWargaId(req, res);
  if (!wargaId) return;
  try {
    const year = parseYearParam(req);
    await ensureMigrationTablesForYear(year);
    const rs = await pool.query(
      `SELECT month_key, amount
       FROM mig_lh_payments_${year}
       WHERE warga_id = $1::uuid
       ORDER BY month_key ASC`,
      [wargaId]
    );
    const data = { warga_id: wargaId, months: rs.rows.map((r) => ({ month: String(r.month_key), amount: Number(r.amount || 0) })) };
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function saveMigration2025Lingkungan(req, res) {
  const actorId = String(req.user?.user_id || '').trim();
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!actorId) return res.status(401).json({ success: false, message: 'User tidak valid' });
  if (!rows.length) return res.status(400).json({ success: false, message: 'rows wajib diisi' });
  try {
    const year = parseYearParam(req);
    await upsertLingkunganMigrationRows({ rows, actorId, year });
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function getMigration2025JimpitanSummary(_req, res) {
  try {
    const year = parseYearParam(_req);
    await ensureMigrationTablesForYear(year);
    const users = await pool.query(`SELECT u.id::text AS warga_id, u.nama FROM users u ORDER BY u.nama`);
    const paidRows = await pool.query(`SELECT warga_id::text AS warga_id, COALESCE(SUM(amount),0) AS total_paid FROM mig_jimpitan_payments_${year} GROUP BY warga_id::text`);
    const paidMap = new Map(paidRows.rows.map((r) => [String(r.warga_id), Number(r.total_paid || 0)]));
    const ty = String(year);
    const annual = 15000 * 12;
    const rows = users.rows.map((u) => ({ warga_id: String(u.warga_id), nama: String(u.nama || ''), ['total_target_' + ty]: annual, ['total_paid_' + ty]: Number(paidMap.get(String(u.warga_id)) || 0), ['closing_arrears_' + ty]: Math.max(annual - Number(paidMap.get(String(u.warga_id)) || 0), 0) }));
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function getMigration2025JimpitanTariffs(_req, res) {
  try {
    const year = parseYearParam(_req);
    const keys = MIGRATION_MONTH_KEYS_FOR_YEAR(year);
    const months = keys.map((m) => ({ month: m, amount: 15000 }));
    return res.json({ success: true, data: { months } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function getMigration2025JimpitanWargaDetail(req, res) {
  const wargaId = readWargaId(req, res);
  if (!wargaId) return;
  try {
    const year = parseYearParam(req);
    await ensureMigrationTablesForYear(year);
    const rs = await pool.query(
      `SELECT month_key, amount
       FROM mig_jimpitan_${year}
       WHERE warga_id = $1::uuid
       ORDER BY month_key ASC`,
      [wargaId]
    );
    const data = { warga_id: wargaId, months: rs.rows.map((r) => ({ month: String(r.month_key), amount: Number(r.amount || 0) })) };
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function saveMigration2025Jimpitan(req, res) {
  const actorId = String(req.user?.user_id || '').trim();
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!actorId) return res.status(401).json({ success: false, message: 'User tidak valid' });
  if (!rows.length) return res.status(400).json({ success: false, message: 'rows wajib diisi' });
  try {
    const year = parseYearParam(req);
    await upsertJimpitanMigrationRows({ rows, actorId, year });
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function getMigration2025TabunganSummary(_req, res) {
  try {
    const year = parseYearParam(_req);
    await ensureMigrationTablesForYear(year);
    const users = await pool.query(`SELECT u.id::text AS warga_id, u.nama FROM users u ORDER BY u.nama`);
    const agg = await pool.query(`SELECT warga_id::text AS warga_id, COALESCE(SUM(amount),0) AS saldo_akhir FROM mig_tabungan_ledger_${year} GROUP BY warga_id::text`);
    const map = new Map(agg.rows.map((r) => [String(r.warga_id), Number(r.saldo_akhir || 0)]));
    const out = users.rows.map((u) => {
      const wargaId = String(u.warga_id);
      const nama = String(u.nama || '');
      const saldo = Number(map.get(String(wargaId)) || 0);
      const v = { warga_id: wargaId, nama };
      v['saldo_akhir_' + String(year)] = saldo;
      return v;
    });
    return res.json({ success: true, data: out });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function getMigration2025TabunganWargaDetail(req, res) {
  const wargaId = readWargaId(req, res);
  if (!wargaId) return;
  try {
    const year = parseYearParam(req);
    await ensureMigrationTablesForYear(year);
    const rs = await pool.query(
      `SELECT month_key, amount
       FROM mig_tabungan_${year}
       WHERE warga_id = $1::uuid
       ORDER BY month_key ASC`,
      [wargaId]
    );
    const data = { warga_id: wargaId, months: rs.rows.map((r) => ({ month: String(r.month_key), amount: Number(r.amount || 0) })) };
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function saveMigration2025Tabungan(req, res) {
  const actorId = String(req.user?.user_id || '').trim();
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!actorId) return res.status(401).json({ success: false, message: 'User tidak valid' });
  if (!rows.length) return res.status(400).json({ success: false, message: 'rows wajib diisi' });
  try {
    const year = parseYearParam(req);
    await upsertTabunganMigrationRows({ rows, actorId, year });
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function getMigration2025SosialSummary(_req, res) {
  try {
    const year = parseYearParam(_req);
    await ensureMigrationTablesForYear(year);
    const rows = await pool.query(`SELECT month_key, pemasukan, pengeluaran, (pemasukan - pengeluaran) AS saldo_bulan FROM mig_sosial_wallet_${year} ORDER BY month_key ASC`);
    const total = rows.rows.reduce((acc, r) => acc + Number(r.saldo_bulan || 0), 0);
    const data = { rows: rows.rows.map((r) => ({ month: String(r.month_key), pemasukan: Number(r.pemasukan || 0), pengeluaran: Number(r.pengeluaran || 0), saldo_bulan: Number(r.saldo_bulan || 0) })), ['saldo_akhir_' + String(year)]: total };
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function getMigration2025SosialDetail(_req, res) {
  try {
    const year = parseYearParam(_req);
    await ensureMigrationTablesForYear(year);
    const rs = await pool.query(`SELECT * FROM mig_sosial_${year} LIMIT 1000`);
    const data = rs.rows;
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function saveMigration2025Sosial(req, res) {
  const actorId = String(req.user?.user_id || '').trim();
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!actorId) return res.status(401).json({ success: false, message: 'User tidak valid' });
  if (!rows.length) return res.status(400).json({ success: false, message: 'rows wajib diisi' });
  try {
    const year = parseYearParam(req);
    await upsertSosialMigrationRows({ rows, actorId, year });
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function getMigration2025KoperasiIuranSummary(_req, res) {
  try {
    const year = parseYearParam(_req);
    await ensureMigrationTablesForYear(year);
    const users = await pool.query(`SELECT u.id::text AS warga_id, u.nama FROM users u ORDER BY u.nama`);
    const agg = await pool.query(`SELECT warga_id::text AS warga_id, COALESCE(SUM(amount),0) AS total_paid FROM mig_kop_iuran_${year} GROUP BY warga_id::text`);
    const map = new Map(agg.rows.map((r) => [String(r.warga_id), Number(r.total_paid || 0)]));
    const rows = users.rows.map((u) => ({ warga_id: String(u.warga_id), nama: String(u.nama || ''), ['total_paid_' + String(year)]: Number(map.get(String(u.warga_id)) || 0) }));
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function getMigration2025KoperasiIuranWargaDetail(req, res) {
  const wargaId = readWargaId(req, res);
  if (!wargaId) return;
  try {
    const year = parseYearParam(req);
    await ensureMigrationTablesForYear(year);
    const rs = await pool.query(
      `SELECT month_key, amount FROM mig_kop_iuran_${year} WHERE warga_id = $1::uuid ORDER BY month_key ASC`,
      [wargaId]
    );
    const data = { warga_id: wargaId, months: rs.rows.map((r) => ({ month: String(r.month_key), amount: Number(r.amount || 0) })) };
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function saveMigration2025KoperasiIuran(req, res) {
  const actorId = String(req.user?.user_id || '').trim();
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!actorId) return res.status(401).json({ success: false, message: 'User tidak valid' });
  if (!rows.length) return res.status(400).json({ success: false, message: 'rows wajib diisi' });
  try {
    await upsertKoperasiIuranMigrationRows({ rows, actorId });
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function getMigration2025KoperasiLoansSummary(_req, res) {
  try {
    const rows = await getKoperasiLoanProgressMigrationSummary2025();
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function saveMigration2025KoperasiLoans(req, res) {
  const actorId = String(req.user?.user_id || '').trim();
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!actorId) return res.status(401).json({ success: false, message: 'User tidak valid' });
  if (!rows.length) return res.status(400).json({ success: false, message: 'rows wajib diisi' });
  try {
    await upsertKoperasiLoanProgress2025({ rows, actorId });
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}
