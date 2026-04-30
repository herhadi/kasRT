import { pool } from '../db.js';
import { randomUUID } from 'crypto';

export async function ensureTabunganTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tab_savings_accounts (
      id UUID PRIMARY KEY,
      warga_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      total_balance NUMERIC(18, 2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tab_events (
      id UUID PRIMARY KEY,
      title VARCHAR(120) NOT NULL,
      event_date DATE NOT NULL,
      total_amount NUMERIC(18, 2) NOT NULL CHECK (total_amount >= 5000),
      notes TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN', 'POSTED', 'CANCELLED')),
      created_by UUID NOT NULL REFERENCES users(id),
      approved_by UUID REFERENCES users(id),
      approved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tab_event_allocations (
      id UUID PRIMARY KEY,
      event_id UUID NOT NULL REFERENCES tab_events(id) ON DELETE CASCADE,
      warga_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      allocated_amount NUMERIC(18, 2) NOT NULL CHECK (allocated_amount >= 0),
      covered_amount NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (covered_amount >= 0),
      outstanding_amount NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (outstanding_amount >= 0),
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'SURPLUS', 'DEFICIT', 'SETTLED')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (event_id, warga_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tab_ledger (
      id UUID PRIMARY KEY,
      warga_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_id UUID REFERENCES tab_events(id) ON DELETE SET NULL,
      source_allocation_id UUID REFERENCES tab_event_allocations(id) ON DELETE SET NULL,
      tx_type VARCHAR(20) NOT NULL
        CHECK (tx_type IN ('DEPOSIT', 'WITHDRAW', 'ALLOCATE', 'SETTLEMENT', 'ADJUSTMENT')),
      direction VARCHAR(10) NOT NULL CHECK (direction IN ('CREDIT', 'DEBIT')),
      amount NUMERIC(18, 2) NOT NULL CHECK (amount >= 5000),
      description TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
      created_by UUID NOT NULL REFERENCES users(id),
      approved_by UUID REFERENCES users(id),
      approved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS tab_ledger_warga_idx ON tab_ledger (warga_id, created_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS tab_event_allocations_event_idx ON tab_event_allocations (event_id)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tab_yearly_balances (
      id UUID PRIMARY KEY,
      year INT NOT NULL,
      warga_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      opening_balance NUMERIC(18, 2) NOT NULL DEFAULT 0,
      closing_balance NUMERIC(18, 2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (year, warga_id)
    )
  `);
}

export async function listTabunganWargaSummary() {
  const result = await pool.query(
    `SELECT
       u.id::text AS warga_id,
       u.nama,
       COALESCE(sa.total_balance, 0) AS total_balance
     FROM users u
     LEFT JOIN tab_savings_accounts sa ON sa.warga_id = u.id
     WHERE NOT EXISTS (
       SELECT 1
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = u.id
         AND LOWER(TRIM(r.name)) = 'root'
     )
     ORDER BY u.nama ASC`
  );
  return result.rows.map((r) => ({
    warga_id: String(r.warga_id),
    nama: String(r.nama || ''),
    total_balance: Number(r.total_balance || 0)
  }));
}

export async function inputTabunganSetoran({ wargaId, amount, description, createdBy }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO tab_savings_accounts (id, warga_id, total_balance)
       VALUES ($1, $2::uuid, 0)
       ON CONFLICT (warga_id) DO NOTHING`,
      [randomUUID(), wargaId]
    );

    await client.query(
      `INSERT INTO tab_ledger
       (id, warga_id, tx_type, direction, amount, description, status, created_by, approved_by, approved_at)
       VALUES ($1, $2::uuid, 'DEPOSIT', 'CREDIT', $3, $4, 'APPROVED', $5::uuid, $5::uuid, NOW())`,
      [randomUUID(), wargaId, amount, description, createdBy]
    );

    await client.query(
      `UPDATE tab_savings_accounts
       SET total_balance = total_balance + $1,
           updated_at = NOW()
       WHERE warga_id = $2::uuid`,
      [amount, wargaId]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createTabunganEvent({ title, eventDate, totalAmount, notes, createdBy }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const eventId = randomUUID();

    await client.query(
      `INSERT INTO tab_events
       (id, title, event_date, total_amount, notes, status, created_by, approved_by, approved_at)
       VALUES ($1, $2, $3::date, $4, $5, 'APPROVED', $6::uuid, $6::uuid, NOW())`,
      [eventId, title, eventDate, totalAmount, notes || null, createdBy]
    );

    const wargaRows = await client.query(
      `SELECT u.id::text AS warga_id
       FROM users u
       WHERE NOT EXISTS (
         SELECT 1
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = u.id
           AND LOWER(TRIM(r.name)) = 'root'
       )`
    );

    const wargaIds = wargaRows.rows.map((r) => String(r.warga_id));
    if (!wargaIds.length) throw new Error('Data warga kosong');

    const perWarga = Math.floor((Number(totalAmount) / wargaIds.length) * 100) / 100;
    const remainder = Number((Number(totalAmount) - perWarga * wargaIds.length).toFixed(2));

    for (let i = 0; i < wargaIds.length; i += 1) {
      const wargaId = wargaIds[i];
      const allocAmount = Number((perWarga + (i === wargaIds.length - 1 ? remainder : 0)).toFixed(2));

      const saldoRow = await client.query(
        `SELECT COALESCE(total_balance, 0) AS total_balance
         FROM tab_savings_accounts
         WHERE warga_id = $1::uuid`,
        [wargaId]
      );
      const saldo = Number(saldoRow.rows[0]?.total_balance || 0);
      const covered = Math.min(saldo, allocAmount);
      const outstanding = Number((allocAmount - covered).toFixed(2));
      const status = outstanding > 0 ? 'DEFICIT' : saldo > allocAmount ? 'SURPLUS' : 'SETTLED';

      const allocationId = randomUUID();
      await client.query(
        `INSERT INTO tab_event_allocations
         (id, event_id, warga_id, allocated_amount, covered_amount, outstanding_amount, status)
         VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7)`,
        [allocationId, eventId, wargaId, allocAmount, covered, outstanding, status]
      );

      if (covered > 0) {
        await client.query(
          `INSERT INTO tab_ledger
           (id, warga_id, event_id, source_allocation_id, tx_type, direction, amount, description, status, created_by, approved_by, approved_at)
           VALUES ($1, $2::uuid, $3::uuid, $4::uuid, 'ALLOCATE', 'DEBIT', $5, $6, 'APPROVED', $7::uuid, $7::uuid, NOW())`,
          [randomUUID(), wargaId, eventId, allocationId, covered, `Alokasi kebutuhan: ${title}`, createdBy]
        );

        await client.query(
          `INSERT INTO tab_savings_accounts (id, warga_id, total_balance)
           VALUES ($1, $2::uuid, 0)
           ON CONFLICT (warga_id) DO NOTHING`,
          [randomUUID(), wargaId]
        );

        await client.query(
          `UPDATE tab_savings_accounts
           SET total_balance = GREATEST(0, total_balance - $1),
               updated_at = NOW()
           WHERE warga_id = $2::uuid`,
          [covered, wargaId]
        );
      }
    }

    await client.query('COMMIT');
    return { event_id: eventId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getTabunganEventDetail(eventId) {
  const [eventRes, allocRes] = await Promise.all([
    pool.query(
      `SELECT id::text AS id, title, event_date, total_amount, notes, status, created_at
       FROM tab_events
       WHERE id = $1::uuid`,
      [eventId]
    ),
    pool.query(
      `SELECT
         a.warga_id::text AS warga_id,
         u.nama,
         a.allocated_amount,
         a.covered_amount,
         a.outstanding_amount,
         a.status
       FROM tab_event_allocations a
       JOIN users u ON u.id = a.warga_id
       WHERE a.event_id = $1::uuid
       ORDER BY u.nama ASC`,
      [eventId]
    )
  ]);

  const event = eventRes.rows[0] || null;
  if (!event) return null;
  const allocations = allocRes.rows.map((r) => ({
    warga_id: String(r.warga_id),
    nama: String(r.nama || ''),
    allocated_amount: Number(r.allocated_amount || 0),
    covered_amount: Number(r.covered_amount || 0),
    outstanding_amount: Number(r.outstanding_amount || 0),
    status: String(r.status || 'PENDING')
  }));

  return { ...event, allocations };
}

export async function listTabunganLedgerByMonth({ month }) {
  const isValidMonth = typeof month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  const result = isValidMonth
    ? await pool.query(
      `SELECT
         l.id::text AS id,
         l.warga_id::text AS warga_id,
         u.nama,
         l.tx_type,
         l.direction,
         l.amount,
         l.description,
         l.status,
         l.created_at
       FROM tab_ledger l
       JOIN users u ON u.id = l.warga_id
       WHERE DATE_TRUNC('month', l.created_at) = DATE_TRUNC('month', TO_DATE($1, 'YYYY-MM'))
       ORDER BY l.created_at DESC`,
      [month]
    )
    : await pool.query(
      `SELECT
         l.id::text AS id,
         l.warga_id::text AS warga_id,
         u.nama,
         l.tx_type,
         l.direction,
         l.amount,
         l.description,
         l.status,
         l.created_at
       FROM tab_ledger l
       JOIN users u ON u.id = l.warga_id
       WHERE DATE_TRUNC('month', l.created_at) = DATE_TRUNC('month', CURRENT_DATE)
       ORDER BY l.created_at DESC`
    );
  return result.rows;
}

export async function closeTabunganYear({ year }) {
  await pool.query(
    `INSERT INTO tab_yearly_balances (id, year, warga_id, closing_balance, updated_at)
     SELECT gen_random_uuid(), $1, u.id, COALESCE(sa.total_balance, 0), NOW()
     FROM users u
     LEFT JOIN tab_savings_accounts sa ON sa.warga_id = u.id
     WHERE NOT EXISTS (
       SELECT 1
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = u.id
         AND LOWER(TRIM(r.name)) = 'root'
     )
     ON CONFLICT (year, warga_id)
     DO UPDATE SET closing_balance = EXCLUDED.closing_balance, updated_at = NOW()`,
    [year]
  );
}

export async function openTabunganYear({ year }) {
  const prevYear = year - 1;
  await pool.query(
    `INSERT INTO tab_yearly_balances (id, year, warga_id, opening_balance, updated_at)
     SELECT gen_random_uuid(), $1, y.warga_id, y.closing_balance, NOW()
     FROM tab_yearly_balances y
     WHERE y.year = $2
     ON CONFLICT (year, warga_id)
     DO UPDATE SET opening_balance = EXCLUDED.opening_balance, updated_at = NOW()`,
    [year, prevYear]
  );
}

export async function getTabunganYearlyBook(year) {
  const rows = await pool.query(
    `SELECT
       y.warga_id::text AS warga_id,
       u.nama,
       y.opening_balance,
       y.closing_balance
     FROM tab_yearly_balances y
     JOIN users u ON u.id = y.warga_id
     WHERE y.year = $1
     ORDER BY u.nama ASC`,
    [year]
  );
  return rows.rows.map((r) => ({
    warga_id: String(r.warga_id),
    nama: String(r.nama || ''),
    opening_balance: Number(r.opening_balance || 0),
    closing_balance: Number(r.closing_balance || 0)
  }));
}
