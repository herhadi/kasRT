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

export async function getDashboardBendaharaIuranWajibAggregate(iuranWajibTargetBulanan) {
  const result = await pool.query(
    `WITH warga AS (
       SELECT DISTINCT u.id
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE LOWER(TRIM(r.name)) = 'warga'
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
       AND NOT EXISTS (
         SELECT 1
         FROM user_roles ur2
         JOIN roles r2 ON r2.id = ur2.role_id
         WHERE ur2.user_id = u2.id
           AND LOWER(TRIM(r2.name)) = 'root'
       )
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
       AND NOT EXISTS (
         SELECT 1
         FROM user_roles ur2
         JOIN roles r2 ON r2.id = ur2.role_id
         WHERE ur2.user_id = u2.id
           AND LOWER(TRIM(r2.name)) = 'root'
       )
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
       AND NOT EXISTS (
         SELECT 1
         FROM user_roles ur2
         JOIN roles r2 ON r2.id = ur2.role_id
         WHERE ur2.user_id = u2.id
           AND LOWER(TRIM(r2.name)) = 'root'
       )
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
