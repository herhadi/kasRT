import { pool } from '../db.js';

const JIMPITAN_TARGET_BULANAN = 15000;
const IURAN_WAJIB_TARGET = 30000;
const INTERNET_TARGET_BULANAN = 60000;
const PEMBANGUNAN_MINIMAL_BULANAN = 5000;

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

    const internetMembershipResult = await pool.query(
      `SELECT EXISTS (
         SELECT 1
         FROM iuran_transactions it
         JOIN contribution_types ct ON ct.id = it.contribution_type_id
         WHERE it.warga_id = $1
           AND ct.name = 'Internet'
       ) AS is_member`,
      [user_id]
    );

    const jimpitan_hari_ini = Number(jimpitanHarianResult.rows[0].total || 0);
    const jimpitan_bulan_ini = Number(jimpitanBulananResult.rows[0].total || 0);

    let iuran_wajib_bulan_ini = 0;
    let internet_bulan_ini = 0;
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

      if (name === 'Internet') {
        internet_bulan_ini = amount;
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

    const isInternetMember = Boolean(internetMembershipResult.rows[0]?.is_member);
    let internet_status = 'NON_MEMBER';
    if (isInternetMember) {
      if (internet_bulan_ini < INTERNET_TARGET_BULANAN) internet_status = 'MENUNGGAK';
      else if (internet_bulan_ini === INTERNET_TARGET_BULANAN) internet_status = 'PAS';
      else internet_status = 'LEBIH';
    }

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
        target_iuran_wajib: IURAN_WAJIB_TARGET,
        internet_bulan_ini,
        internet_target_bulanan: INTERNET_TARGET_BULANAN,
        internet_is_member: isInternetMember,
        internet_status
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false });
  }
}

export async function dashboardAdminPembangunan(_req, res) {
  try {
    const aggregateResult = await pool.query(
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

    return res.json({
      success: true,
      data: {
        minimal_setoran_bulanan: PEMBANGUNAN_MINIMAL_BULANAN,
        setoran_bulan_ini: Number(aggregateResult.rows[0]?.setoran_bulan_ini || 0),
        pengeluaran_bulan_ini: Math.abs(Number(aggregateResult.rows[0]?.pengeluaran_bulan_ini || 0)),
        total_setoran_semua_waktu: Number(aggregateResult.rows[0]?.total_setoran_semua_waktu || 0),
        total_pengeluaran_semua_waktu: Math.abs(Number(aggregateResult.rows[0]?.total_pengeluaran_semua_waktu || 0)),
        saldo_total: Number(aggregateResult.rows[0]?.saldo_total || 0)
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false });
  }
}

export async function dashboardAdminInternet(_req, res) {
  try {
    const result = await pool.query(
      `WITH anggota AS (
         SELECT DISTINCT it.warga_id
         FROM iuran_transactions it
         JOIN contribution_types ct ON ct.id = it.contribution_type_id
         WHERE ct.name = 'Internet'
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
      [INTERNET_TARGET_BULANAN]
    );

    const totalAnggota = Number(result.rows[0]?.total_anggota || 0);
    return res.json({
      success: true,
      data: {
        tarif_bulanan: INTERNET_TARGET_BULANAN,
        total_anggota: totalAnggota,
        target_bulan_ini: totalAnggota * INTERNET_TARGET_BULANAN,
        pemasukan_bulan_ini: Number(result.rows[0]?.pemasukan_bulan_ini || 0),
        total_menunggak: Number(result.rows[0]?.total_menunggak || 0),
        total_pas: Number(result.rows[0]?.total_pas || 0),
        total_lebih: Number(result.rows[0]?.total_lebih || 0)
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false });
  }
}

export async function dashboardAdminKoperasi(_req, res) {
  try {
    const result = await pool.query(
      `SELECT
         COALESCE(SUM(CASE
           WHEN DATE_TRUNC('month', it.tanggal) = DATE_TRUNC('month', CURRENT_DATE) THEN it.amount
           ELSE 0
         END), 0) AS total_bulan_ini,
         COALESCE(SUM(it.amount), 0) AS total_semua_waktu,
         COUNT(DISTINCT it.warga_id) AS total_anggota
       FROM iuran_transactions it
       JOIN contribution_types ct ON ct.id = it.contribution_type_id
       WHERE ct.name = 'Koperasi'`
    );

    return res.json({
      success: true,
      data: {
        total_bulan_ini: Number(result.rows[0]?.total_bulan_ini || 0),
        total_semua_waktu: Number(result.rows[0]?.total_semua_waktu || 0),
        total_anggota: Number(result.rows[0]?.total_anggota || 0),
        catatan: 'Modul simpan-pinjam detail (pinjaman, tenor, angsuran) belum diaktifkan pada skema ini.'
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

export async function dashboardAdminJimpitan(_req, res) {
  try {
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

    return res.json({
      success: true,
      data: {
        pemasukan_harian: Number(todayResult.rows[0]?.total || 0),
        pemasukan_bulanan: Number(monthResult.rows[0]?.total_bulan_ini || 0),
        total_batch_approved: Number(monthResult.rows[0]?.total_batch_approved || 0),
        total_batch_pending: Number(monthResult.rows[0]?.total_batch_pending || 0),
        rekap_bulan_lalu: Number(lastMonthResult.rows[0]?.total_bulan_lalu || 0)
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false });
  }
}
