import { pool } from '../db.js';

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
     GROUP BY jd.warga_id`,
    [batchId]
  );
  return result.rows;
}

export async function listJimpitanByOperationalDate(operationalDate) {
  const result = await pool.query(
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
     )
     SELECT
       u.id,
       u.nama,
       COALESCE(u.jimpitan_saldo, 0) AS saldo,
       COALESCE(dn.nominal_hari_ini, 0) AS nominal_hari_ini,
       p.nama AS petugas,
       dli.detail_status,
       dli.batch_status
     FROM users u
     LEFT JOIN daily_nominal dn ON dn.warga_id = u.id
     LEFT JOIN daily_petugas dp ON dp.warga_id = u.id
     LEFT JOIN daily_latest_input dli ON dli.warga_id = u.id
     LEFT JOIN users p ON p.id = dp.petugas_id
     ORDER BY u.nama ASC`,
    [operationalDate]
  );
  return result.rows;
}

export async function topUpJimpitanSaldo({ wargaId, nominal, adminId, note = null }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userCheck = await client.query('SELECT id, nama FROM users WHERE id = $1', [wargaId]);
    if (userCheck.rows.length === 0) {
      throw new Error('Warga tidak ditemukan');
    }

    const saldoResult = await client.query(
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

    await client.query('COMMIT');
    return Number(saldoResult.rows[0].jimpitan_saldo);
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

    const saldoResult = await client.query(
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

    await client.query('COMMIT');
    return {
      detail_id: detail.id,
      nominal_lama: nominalLama,
      nominal_baru: nominalBaru,
      delta,
      saldo_akhir: Number(saldoResult.rows[0]?.jimpitan_saldo || 0),
      batch_id: detail.batch_id || null
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function resetBulananJimpitanSaldo(targetBulanan) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE users
       SET jimpitan_saldo = CASE
         WHEN COALESCE(jimpitan_saldo, 0) >= $1 THEN COALESCE(jimpitan_saldo, 0) - $1
         ELSE 0
       END`,
      [targetBulanan]
    );

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
