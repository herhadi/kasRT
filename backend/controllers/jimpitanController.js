import { pool } from '../db.js';

//
// 🧪 HEALTH CHECK
//
export async function healthCheck(_req, res) {
  return res.json({ message: 'Jimpitan route OK' });
}

//
// 🌾 INPUT JIMPITAN
//
export const inputJimpitan = async (req, res) => {
  const { warga_id, nominal } = req.body;
  const petugas_id = req.user.user_id;

  const tanggal = new Date();

  try {
    await pool.query(`
      INSERT INTO jimpitan_details (warga_id, nominal, tanggal, petugas_id)
      VALUES ($1, $2, $3, $4)
    `, [warga_id, nominal, tanggal, petugas_id]);

    res.json({ success: true });

  } catch (err) {
    console.error("INPUT ERROR:", err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

//
// 📦 SETOR JIMPITAN
//
export async function setorJimpitan(req, res) {
  const { detail_ids } = req.body;
  const petugas_id = req.user.user_id; // 🔥 FIX

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const totalResult = await client.query(
      `SELECT SUM(nominal) AS total
       FROM jimpitan_details
       WHERE id = ANY($1)`,
      [detail_ids]
    );

    const total = totalResult.rows[0].total || 0;

    const batchResult = await client.query(
      `INSERT INTO jimpitan_batches (petugas_id, total_amount, status)
       VALUES ($1, $2, 'PENDING')
       RETURNING id`,
      [petugas_id, total]
    );

    const batch_id = batchResult.rows[0].id;

    for (const id of detail_ids) {
      await client.query(
        `INSERT INTO jimpitan_batch_items (batch_id, jimpitan_detail_id)
         VALUES ($1, $2)`,
        [batch_id, id]
      );

      await client.query(
        `UPDATE jimpitan_details
         SET status = 'SUBMITTED'
         WHERE id = $1`,
        [id]
      );
    }

    await client.query('COMMIT');
    return res.json({ success: true, batch_id });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("SETOR ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message
    });

  } finally {
    client.release();
  }
}

//
// ✅ APPROVE JIMPITAN (ADMIN)
//
export async function approveJimpitan(req, res) {
  const { batch_id } = req.body;
  const admin_id = req.user.user_id; // 🔥 FIX

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const batchResult = await client.query(
      'SELECT total_amount FROM jimpitan_batches WHERE id = $1',
      [batch_id]
    );

    if (batchResult.rows.length === 0) {
      throw new Error('Batch tidak ditemukan');
    }

    const total = batchResult.rows[0].total_amount;

    await client.query(
      `UPDATE jimpitan_batches
       SET status = 'APPROVED',
           approved_by = $1,
           approved_at = NOW()
       WHERE id = $2`,
      [admin_id, batch_id]
    );

    // 🔥 ambil wallet otomatis
    const walletResult = await client.query(
      `SELECT id FROM wallets WHERE name = 'Kas Jimpitan' LIMIT 1`
    );

    const wallet_id = walletResult.rows[0].id;

    await client.query(
      `INSERT INTO transactions
       (type, target_wallet_id, amount, status, created_by, approved_by, approved_at)
       VALUES ('IN', $1, $2, 'APPROVED', $3, $3, NOW())`,
      [wallet_id, total, admin_id]
    );

    await client.query('COMMIT');
    return res.json({ success: true });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("APPROVE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message
    });

  } finally {
    client.release();
  }
}

//
// 📊 LIST JIMPITAN
//
export async function listJimpitan(req, res) {
  try {
    const result = await pool.query(`
      SELECT
        u.id,
        u.nama,
        COALESCE(j.nominal, 0) AS nominal,
        CASE
          WHEN j.nominal IS NULL THEN 'BELUM'
          WHEN j.nominal = 0 THEN 'KOSONG'
          ELSE 'LUNAS'
        END AS status,
        p.nama AS petugas
      FROM users u
      LEFT JOIN (
        SELECT DISTINCT ON (warga_id) *
        FROM jimpitan_details
        ORDER BY warga_id, created_at DESC
      ) j ON j.warga_id = u.id
      LEFT JOIN users p ON p.id = j.petugas_id
    `);

    return res.json({ success: true, data: result.rows });

  } catch (err) {
    console.error("LIST ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
}