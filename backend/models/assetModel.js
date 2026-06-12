import { randomUUID } from 'crypto';
import { pool } from '../db.js';

export const KAS_SEWA_ASET = 'Kas Sewa Aset';

export async function ensureAssetTables() {
  await pool.query(
    `INSERT INTO wallets (name)
     SELECT $1::text
     WHERE NOT EXISTS (
       SELECT 1 FROM wallets WHERE LOWER(name) = LOWER($1::text)
     )`,
    [KAS_SEWA_ASET]
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS assets (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
      condition TEXT NOT NULL DEFAULT 'Baik',
      rental_rate NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (rental_rate >= 0),
      notes TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS asset_rentals (
      id UUID PRIMARY KEY,
      asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
      renter_name TEXT NOT NULL,
      renter_phone TEXT,
      rental_date DATE NOT NULL,
      return_date DATE,
      quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
      amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
      notes TEXT,
      transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'PENDING_PAYMENT',
      paid_by UUID,
      paid_at TIMESTAMPTZ,
      created_by UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE asset_rentals
      ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'PENDING_PAYMENT',
      ADD COLUMN IF NOT EXISTS paid_by UUID,
      ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ
  `);
  await pool.query(`
    UPDATE asset_rentals
    SET status = 'PAID',
        paid_at = COALESCE(paid_at, created_at)
    WHERE transaction_id IS NOT NULL
      AND status <> 'PAID'
  `);
}

export async function listAssets() {
  await ensureAssetTables();
  const result = await pool.query(`
    SELECT
      a.id::text,
      a.name,
      a.category,
      a.quantity,
      a.condition,
      a.rental_rate,
      a.notes,
      a.is_active,
      COALESCE(r.total_rental, 0) AS total_rental,
      COALESCE(r.total_amount, 0) AS total_amount,
      a.created_at,
      a.updated_at
    FROM assets a
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS total_rental,
        COALESCE(SUM(amount) FILTER (WHERE status = 'PAID'), 0) AS total_amount
      FROM asset_rentals ar
      WHERE ar.asset_id = a.id
    ) r ON TRUE
    ORDER BY a.is_active DESC, a.name ASC
  `);
  return result.rows.map((row) => ({
    ...row,
    quantity: Number(row.quantity || 0),
    rental_rate: Number(row.rental_rate || 0),
    total_rental: Number(row.total_rental || 0),
    total_amount: Number(row.total_amount || 0)
  }));
}

export async function upsertAsset({ id, name, category, quantity, condition, rentalRate, notes, isActive = true, actor }) {
  await ensureAssetTables();
  const assetId = id || randomUUID();
  const result = await pool.query(
    `INSERT INTO assets (id, name, category, quantity, condition, rental_rate, notes, is_active, created_by)
     VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6, NULLIF($7, ''), $8, $9::uuid)
     ON CONFLICT (id)
     DO UPDATE SET
       name = EXCLUDED.name,
       category = EXCLUDED.category,
       quantity = EXCLUDED.quantity,
       condition = EXCLUDED.condition,
       rental_rate = EXCLUDED.rental_rate,
       notes = EXCLUDED.notes,
       is_active = EXCLUDED.is_active,
       updated_at = NOW()
     RETURNING id::text, name, category, quantity, condition, rental_rate, notes, is_active`,
    [
      assetId,
      name,
      category || '',
      quantity,
      condition || 'Baik',
      rentalRate,
      notes || '',
      Boolean(isActive),
      actor || null
    ]
  );
  return result.rows[0];
}

export async function setAssetActive({ id, isActive }) {
  await ensureAssetTables();
  const result = await pool.query(
    `UPDATE assets
     SET is_active = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING id::text`,
    [id, Boolean(isActive)]
  );
  return result.rows[0] || null;
}

export async function listAssetRentals({ limit = 30 } = {}) {
  await ensureAssetTables();
  const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const result = await pool.query(
    `SELECT
       ar.id::text,
       ar.asset_id::text,
       a.name AS asset_name,
       ar.renter_name,
       ar.renter_phone,
       ar.rental_date,
       ar.return_date,
       ar.quantity,
       ar.amount,
       ar.notes,
       ar.transaction_id,
       ar.status,
       ar.paid_at,
       ar.paid_by::text,
       payer.nama AS paid_by_nama,
       creator.nama AS created_by_nama,
       ar.created_at
     FROM asset_rentals ar
     JOIN assets a ON a.id = ar.asset_id
     LEFT JOIN users payer ON payer.id::text = ar.paid_by::text
     LEFT JOIN users creator ON creator.id::text = ar.created_by::text
     ORDER BY ar.rental_date DESC, ar.created_at DESC
     LIMIT $1`,
    [safeLimit]
  );
  return result.rows.map((row) => ({
    ...row,
    quantity: Number(row.quantity || 0),
    amount: Number(row.amount || 0)
  }));
}

export async function createAssetRental({ assetId, renterName, renterPhone, rentalDate, returnDate, quantity, amount, notes, actor }) {
  await ensureAssetTables();
  const asset = await pool.query(
    `SELECT id, quantity, is_active
     FROM assets
     WHERE id = $1
     LIMIT 1`,
    [assetId]
  );
  if (!asset.rows.length) throw new Error('Aset tidak ditemukan');
  if (!asset.rows[0].is_active) throw new Error('Aset tidak aktif');
  if (Number(quantity) > Number(asset.rows[0].quantity || 0)) {
    throw new Error('Jumlah sewa melebihi jumlah aset tersedia');
  }

  const rental = await pool.query(
    `INSERT INTO asset_rentals
     (id, asset_id, renter_name, renter_phone, rental_date, return_date, quantity, amount, notes, status, created_by)
     VALUES ($1, $2, $3, NULLIF($4, ''), $5::date, NULLIF($6, '')::date, $7, $8, NULLIF($9, ''), 'PENDING_PAYMENT', $10::uuid)
     RETURNING id::text`,
    [
      randomUUID(),
      assetId,
      renterName,
      renterPhone || '',
      rentalDate,
      returnDate || '',
      quantity,
      amount,
      notes || '',
      actor || null
    ]
  );
  return rental.rows[0];
}

export async function confirmAssetRentalPayment({ rentalId, actor }) {
  await ensureAssetTables();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const rental = await client.query(
      `SELECT
         ar.id,
         ar.amount,
         ar.renter_name,
         ar.transaction_id,
         ar.status,
         a.name AS asset_name
       FROM asset_rentals ar
       JOIN assets a ON a.id = ar.asset_id
       WHERE ar.id = $1
       FOR UPDATE`,
      [rentalId]
    );
    if (!rental.rows.length) throw new Error('Data sewa tidak ditemukan');
    const row = rental.rows[0];
    if (row.transaction_id || row.status === 'PAID') throw new Error('Sewa aset sudah dikonfirmasi lunas');

    const wallet = await client.query(
      `SELECT id FROM wallets WHERE LOWER(name) = LOWER($1) LIMIT 1`,
      [KAS_SEWA_ASET]
    );
    if (!wallet.rows.length) throw new Error('Wallet Kas Sewa Aset tidak ditemukan');

    const tx = await client.query(
      `INSERT INTO transactions
       (type, target_wallet_id, amount, status, description, created_by, approved_by, approved_at)
       VALUES ('IN', $1, $2, 'APPROVED', $3, $4::uuid, $4::uuid, NOW())
       RETURNING id`,
      [
        wallet.rows[0].id,
        row.amount,
        `[ASSET_RENTAL] Pembayaran sewa aset ${row.asset_name} oleh ${row.renter_name}`,
        actor || null
      ]
    );

    await client.query(
      `UPDATE asset_rentals
       SET status = 'PAID',
           transaction_id = $2,
           paid_by = $3::uuid,
           paid_at = NOW()
       WHERE id = $1`,
      [rentalId, tx.rows[0].id, actor || null]
    );

    await client.query('COMMIT');
    return { id: rentalId, transaction_id: tx.rows[0].id };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
