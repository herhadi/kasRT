import express from 'express';
import { pool } from '../db.js';

const router = express.Router();

// INPUT JIMPITAN (petugas)
router.post('/input', async (req, res) => {
  const { warga_id, nominal, petugas_id } = req.body;

  await pool.query(`
    INSERT INTO jimpitan_details (warga_id, nominal, tanggal, petugas_id, status)
    VALUES ($1, $2, CURRENT_DATE, $3, 'DRAFT')
  `, [warga_id, nominal, petugas_id]);

  res.json({ success: true });
});

// SETOR JIMPITAN (buat batch)
router.post('/setor', async (req, res) => {
  const { petugas_id, detail_ids } = req.body;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const total = await client.query(`
      SELECT SUM(nominal) as total 
      FROM jimpitan_details 
      WHERE id = ANY($1)
    `, [detail_ids]);

    const batch = await client.query(`
      INSERT INTO jimpitan_batches (petugas_id, total_amount, status)
      VALUES ($1, $2, 'PENDING')
      RETURNING id
    `, [petugas_id, total.rows[0].total]);

    const batch_id = batch.rows[0].id;

    for (let id of detail_ids) {
      await client.query(`
        INSERT INTO jimpitan_batch_items (batch_id, jimpitan_detail_id)
        VALUES ($1, $2)
      `, [batch_id, id]);

      await client.query(`
        UPDATE jimpitan_details 
        SET status = 'SUBMITTED'
        WHERE id = $1
      `, [id]);
    }

    await client.query('COMMIT');

    res.json({ success: true, batch_id });

  } catch (err) {
    await client.query('ROLLBACK');
    res.json({ success: false });
  } finally {
    client.release();
  }
});

// APPROVE JIMPITAN (admin)
router.post('/approve', async (req, res) => {
  const { batch_id, admin_id, wallet_id } = req.body;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ambil total
    const batch = await client.query(`
      SELECT total_amount FROM jimpitan_batches WHERE id = $1
    `, [batch_id]);

    const total = batch.rows[0].total_amount;

    // update batch
    await client.query(`
      UPDATE jimpitan_batches
      SET status = 'APPROVED', approved_by = $1, approved_at = NOW()
      WHERE id = $2
    `, [admin_id, batch_id]);

    // insert ke kas
    await client.query(`
      INSERT INTO transactions 
      (type, target_wallet_id, amount, status, created_by, approved_by, approved_at)
      VALUES ('IN', $1, $2, 'APPROVED', $3, $3, NOW())
    `, [wallet_id, total, admin_id]);

    await client.query('COMMIT');

    res.json({ success: true });

  } catch (err) {
    await client.query('ROLLBACK');
    res.json({ success: false });
  } finally {
    client.release();
  }
});