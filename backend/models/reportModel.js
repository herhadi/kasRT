import { pool } from '../db.js';

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

export async function getJimpitanBulananByWarga(userId) {
  const result = await pool.query(
    `SELECT COALESCE(SUM(nominal), 0) AS total
     FROM jimpitan_details
     WHERE warga_id = $1
     AND DATE_TRUNC('month', tanggal) = DATE_TRUNC('month', CURRENT_DATE)`,
    [userId]
  );
  return Number(result.rows[0]?.total || 0);
}

export async function getIuranBulananByWarga(userId) {
  const result = await pool.query(
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
    [userId]
  );
  return result.rows;
}

export async function isInternetMember(userId) {
  const result = await pool.query(
    `SELECT EXISTS (
       SELECT 1
       FROM iuran_transactions it
       JOIN contribution_types ct ON ct.id = it.contribution_type_id
       WHERE it.warga_id = $1
         AND ct.name = 'Internet'
     ) AS is_member`,
    [userId]
  );
  return Boolean(result.rows[0]?.is_member);
}

export async function isLingkunganMember(userId) {
  const result = await pool.query(
    `SELECT EXISTS (
       SELECT 1
       FROM iuran_transactions it
       JOIN contribution_types ct ON ct.id = it.contribution_type_id
       WHERE it.warga_id = $1
         AND ct.name IN ('Lingkungan', 'Sampah', 'Iuran Sampah')
     ) AS is_member`,
    [userId]
  );
  return Boolean(result.rows[0]?.is_member);
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
    [internetTargetBulanan]
  );
  return result.rows[0] || {};
}

export async function getDashboardAdminKoperasiAggregate() {
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
  return result.rows[0] || {};
}

export async function getDashboardAdminLingkunganAggregate(lingkunganTargetBulanan) {
  const result = await pool.query(
    `WITH anggota AS (
       SELECT DISTINCT it.warga_id
       FROM iuran_transactions it
       JOIN contribution_types ct ON ct.id = it.contribution_type_id
       WHERE ct.name IN ('Lingkungan', 'Sampah', 'Iuran Sampah')
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
