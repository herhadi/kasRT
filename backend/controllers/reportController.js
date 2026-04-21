import { pool } from '../db.js';

const JIMPITAN_TARGET_BULANAN = 15000;
const IURAN_WAJIB_TARGET = 30000;

export async function dashboardWarga(req, res) {
  const user_id = req.user.user_id;

  try {
    const jimpitanHarianResult = await pool.query(
      `SELECT COALESCE(SUM(nominal), 0) AS total
       FROM jimpitan_details
       WHERE warga_id = $1
       AND tanggal = CURRENT_DATE`,
      [user_id]
    );

    const jimpitanBulananResult = await pool.query(
      `SELECT COALESCE(SUM(nominal), 0) AS total
       FROM jimpitan_details
       WHERE warga_id = $1
       AND DATE_TRUNC('month', tanggal) = DATE_TRUNC('month', CURRENT_DATE)`,
      [user_id]
    );

    const iuranResult = await pool.query(
      `SELECT
         ct.name,
         ct.is_mandatory,
         COALESCE(SUM(it.amount), 0) AS total
       FROM contribution_types ct
       LEFT JOIN iuran_transactions it
         ON it.contribution_type_id = ct.id
         AND it.warga_id = $1
         AND DATE_TRUNC('month', it.tanggal) = DATE_TRUNC('month', CURRENT_DATE)
       GROUP BY ct.id, ct.name, ct.is_mandatory
       ORDER BY ct.is_mandatory DESC, ct.name ASC`,
      [user_id]
    );

    const jimpitan_hari_ini = Number(jimpitanHarianResult.rows[0].total || 0);
    const jimpitan_bulan_ini = Number(jimpitanBulananResult.rows[0].total || 0);

    let iuran_wajib_bulan_ini = 0;
    let total_optional_bulan_ini = 0;
    const optional_contributions = [];

    iuranResult.rows.forEach((row) => {
      const name = row.name;
      const amount = Number(row.total || 0);
      const isMandatory = row.is_mandatory;

      if (name === 'Iuran Wajib') {
        iuran_wajib_bulan_ini = amount;
        return;
      }

      if (name === 'Jimpitan') {
        return;
      }

      if (!isMandatory) {
        total_optional_bulan_ini += amount;
      }

      optional_contributions.push({
        name,
        is_mandatory: Boolean(isMandatory),
        amount
      });
    });

    const total_kontribusi_bulan_ini =
      jimpitan_bulan_ini + iuran_wajib_bulan_ini + total_optional_bulan_ini;

    return res.json({
      success: true,
      data: {
        jimpitan_hari_ini,
        jimpitan_bulan_ini,
        iuran_wajib_bulan_ini,
        optional_contributions,
        total_optional_bulan_ini,
        total_kontribusi_bulan_ini,
        target_kontribusi_dasar: JIMPITAN_TARGET_BULANAN + IURAN_WAJIB_TARGET,
        target_jimpitan_bulanan: JIMPITAN_TARGET_BULANAN,
        target_iuran_wajib: IURAN_WAJIB_TARGET
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false });
  }
}

export async function laporanBulanan(req, res) {
  const { bulan } = req.query;

  try {
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

    let pemasukan = 0;
    let pengeluaran = 0;

    result.rows.forEach((r) => {
      if (r.type === 'IN') pemasukan += Number(r.total);
      if (r.type === 'OUT') pengeluaran += Number(r.total);
    });

    return res.json({
      success: true,
      data: {
        pemasukan,
        pengeluaran,
        saldo: pemasukan - pengeluaran
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false });
  }
}
