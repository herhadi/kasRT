import { pool } from '../db.js';
import { notifyRoles, notifyUser } from '../services/approvalNotifier.js';
import { formatRupiah } from '../services/telegramService.js';

const TARGET_BULANAN = 15000;
const BIAYA_HARIAN = 500;

function getOperationalDate(now = new Date()) {
  const opDate = new Date(now);
  if (opDate.getHours() < 6) {
    opDate.setDate(opDate.getDate() - 1);
  }
  opDate.setHours(0, 0, 0, 0);
  return opDate;
}

function canInputByTime(userRoles = [], now = new Date()) {
  const isAdmin = userRoles.includes('Admin') || userRoles.includes('Admin Jimpitan');
  if (isAdmin) return true;

  const hour = now.getHours();
  return hour >= 21 || hour < 6;
}

function calculateNominalSaran(saldo, hariKe) {
  const totalKewajibanHarian = hariKe * BIAYA_HARIAN;

  if (saldo >= TARGET_BULANAN || saldo >= totalKewajibanHarian) {
    return 0;
  }

  const kekuranganHarian = totalKewajibanHarian - saldo;
  const sisaPlafonBulanan = TARGET_BULANAN - saldo;
  let nominalSaran = Math.min(kekuranganHarian, sisaPlafonBulanan);

  if (nominalSaran < BIAYA_HARIAN && nominalSaran > 0) {
    nominalSaran = BIAYA_HARIAN;
  }

  return Math.max(nominalSaran, 0);
}

export async function healthCheck(_req, res) {
  return res.json({ message: 'Jimpitan route OK' });
}

export async function inputJimpitan(req, res) {
  const { warga_id, nominal } = req.body;
  const petugas_id = req.user.user_id;
  const roles = req.user.roles || [];

  if (!canInputByTime(roles)) {
    return res.status(403).json({
      success: false,
      message: 'JAM OPERASIONAL TUTUP: input hanya jam 21.00 - 06.00 untuk non-admin.'
    });
  }

  const nilaiNominal = Number(nominal || 0);
  if (nilaiNominal < 0) {
    return res.status(400).json({ success: false, message: 'Nominal tidak valid' });
  }

  const tanggalOperasional = getOperationalDate();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO jimpitan_details (warga_id, nominal, tanggal, petugas_id, status)
       VALUES ($1, $2, $3::date, $4, 'DRAFT')`,
      [warga_id, nilaiNominal, tanggalOperasional.toISOString().slice(0, 10), petugas_id]
    );

    await client.query(
      `UPDATE users
       SET jimpitan_saldo = COALESCE(jimpitan_saldo, 0) + $1
       WHERE id = $2`,
      [nilaiNominal, warga_id]
    );

    await client.query('COMMIT');
    return res.json({ success: true, tanggal_operasional: tanggalOperasional });
  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
}

export async function setorJimpitan(req, res) {
  const petugas_id = req.user.user_id;
  const inputDetailIds = Array.isArray(req.body.detail_ids) ? req.body.detail_ids : null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const detailQuery = inputDetailIds && inputDetailIds.length > 0
      ? {
          text: `SELECT id, nominal
                 FROM jimpitan_details
                 WHERE status = 'DRAFT' AND petugas_id = $1 AND id = ANY($2::int[])`,
          values: [petugas_id, inputDetailIds]
        }
      : {
          text: `SELECT id, nominal
                 FROM jimpitan_details
                 WHERE status = 'DRAFT' AND petugas_id = $1`,
          values: [petugas_id]
        };

    const details = await client.query(detailQuery.text, detailQuery.values);

    if (details.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Tidak ada data draft untuk disetor' });
    }

    const total = details.rows.reduce((sum, row) => sum + Number(row.nominal || 0), 0);

    const batchResult = await client.query(
      `INSERT INTO jimpitan_batches (petugas_id, total_amount, status)
       VALUES ($1, $2, 'PENDING')
       RETURNING id`,
      [petugas_id, total]
    );

    const batch_id = batchResult.rows[0].id;

    for (const row of details.rows) {
      await client.query(
        `INSERT INTO jimpitan_batch_items (batch_id, jimpitan_detail_id)
         VALUES ($1, $2)`,
        [batch_id, row.id]
      );

      await client.query(
        `UPDATE jimpitan_details
         SET status = 'SUBMITTED'
         WHERE id = $1`,
        [row.id]
      );
    }

    await client.query('COMMIT');

    await notifyRoles(
      ['Admin Jimpitan', 'Admin'],
      `🔔 <b>Approval Setoran Jimpitan Dibutuhkan</b>\n` +
        `Batch ID: <b>${batch_id}</b>\n` +
        `Petugas ID: <b>${petugas_id}</b>\n` +
        `Total: <b>${formatRupiah(total)}</b>\n` +
        `Rumah: <b>${details.rows.length}</b>`
    );

    return res.json({
      success: true,
      batch_id,
      total,
      total_rumah: details.rows.length
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
}

export async function approveJimpitan(req, res) {
  const { batch_id } = req.body;
  const admin_id = req.user.user_id;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const batchResult = await client.query(
      `SELECT total_amount, status
       FROM jimpitan_batches
       WHERE id = $1`,
      [batch_id]
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
      [admin_id, batch_id]
    );

    await client.query(
      `UPDATE jimpitan_details jd
       SET status = 'APPROVED'
       FROM jimpitan_batch_items jbi
       WHERE jbi.jimpitan_detail_id = jd.id
       AND jbi.batch_id = $1`,
      [batch_id]
    );

    const walletResult = await client.query(
      `SELECT id FROM wallets WHERE name = 'Kas Jimpitan' LIMIT 1`
    );

    if (walletResult.rows.length === 0) {
      throw new Error('Wallet Kas Jimpitan tidak ditemukan');
    }

    const wallet_id = walletResult.rows[0].id;

    await client.query(
      `INSERT INTO transactions
       (type, target_wallet_id, amount, status, created_by, approved_by, approved_at)
       VALUES ('IN', $1, $2, 'APPROVED', $3, $3, NOW())`,
      [wallet_id, total, admin_id]
    );

    await client.query('COMMIT');

    const creator = await pool.query(
      `SELECT petugas_id, total_amount FROM jimpitan_batches WHERE id = $1`,
      [batch_id]
    );

    if (creator.rows.length > 0) {
      await notifyUser(
        creator.rows[0].petugas_id,
        `✅ <b>Setoran Jimpitan Disetujui</b>\n` +
          `Batch ID: <b>${batch_id}</b>\n` +
          `Total: <b>${formatRupiah(creator.rows[0].total_amount)}</b>`
      );
    }

    return res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
}

export async function listJimpitan(req, res) {
  try {
    const operationalDate = getOperationalDate();
    const hariKe = operationalDate.getDate();

    const result = await pool.query(
      `WITH daily_inputs AS (
         SELECT
           jd.warga_id,
           COALESCE(SUM(jd.nominal), 0) AS nominal_hari_ini,
           MAX(jd.petugas_id) AS petugas_id
         FROM jimpitan_details jd
         WHERE jd.tanggal = $1::date
         GROUP BY jd.warga_id
       )
       SELECT
         u.id,
         u.nama,
         COALESCE(u.jimpitan_saldo, 0) AS saldo,
         COALESCE(di.nominal_hari_ini, 0) AS nominal_hari_ini,
         p.nama AS petugas
       FROM users u
       LEFT JOIN daily_inputs di ON di.warga_id = u.id
       LEFT JOIN users p ON p.id = di.petugas_id
       ORDER BY u.nama ASC`,
      [operationalDate.toISOString().slice(0, 10)]
    );

    const data = result.rows.map((row) => {
      const saldo = Number(row.saldo || 0);
      const nominalHariIni = Number(row.nominal_hari_ini || 0);
      const totalKewajibanHarian = hariKe * BIAYA_HARIAN;

      const lunasByInput = nominalHariIni > 0 || nominalHariIni === 0 && row.petugas;
      const lunasBySaldo = saldo >= TARGET_BULANAN || saldo >= totalKewajibanHarian;
      const isLunasUI = Boolean(lunasByInput || lunasBySaldo);

      const nominalSaran = isLunasUI ? 0 : calculateNominalSaran(saldo, hariKe);

      return {
        id: row.id,
        nama: row.nama,
        status: isLunasUI ? 'LUNAS' : 'BELUM',
        namaPetugas: lunasByInput ? (row.petugas || '') : (lunasBySaldo ? 'Deposit' : ''),
        isLunas: isLunasUI,
        nominalSaran,
        nominalTerbayar: lunasByInput ? nominalHariIni : (lunasBySaldo ? 1 : 0),
        saldo
      };
    });

    return res.json({
      success: true,
      operational_date: operationalDate,
      data
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function topUpJimpitan(req, res) {
  const { warga_id, nominal, note } = req.body;
  const admin_id = req.user.user_id;

  const nilaiNominal = Number(nominal || 0);
  if (nilaiNominal <= 0) {
    return res.status(400).json({ success: false, message: 'Nominal topup harus lebih dari 0' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userCheck = await client.query('SELECT id, nama FROM users WHERE id = $1', [warga_id]);
    if (userCheck.rows.length === 0) {
      throw new Error('Warga tidak ditemukan');
    }

    const saldoResult = await client.query(
      `UPDATE users
       SET jimpitan_saldo = COALESCE(jimpitan_saldo, 0) + $1
       WHERE id = $2
       RETURNING jimpitan_saldo`,
      [nilaiNominal, warga_id]
    );

    await client.query(
      `INSERT INTO jimpitan_topups (warga_id, nominal, admin_id, note)
       VALUES ($1, $2, $3, $4)`,
      [warga_id, nilaiNominal, admin_id, note || null]
    );

    await client.query('COMMIT');

    return res.json({
      success: true,
      saldo_akhir: Number(saldoResult.rows[0].jimpitan_saldo)
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
}

export async function resetBulananJimpitan(_req, res) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE users
       SET jimpitan_saldo = CASE
         WHEN COALESCE(jimpitan_saldo, 0) >= $1 THEN COALESCE(jimpitan_saldo, 0) - $1
         ELSE 0
       END`,
      [TARGET_BULANAN]
    );

    await client.query('COMMIT');
    return res.json({ success: true, message: 'Reset bulanan jimpitan selesai' });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
}
