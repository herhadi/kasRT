import { pool } from '../db.js';
import { randomUUID } from 'crypto';
import { ELIGIBLE_USERS_CLAUSE } from './eligibleUsersSql.js';

export const TABUNGAN_MINIMUM_FEE = 5000;

export async function ensureTabunganTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tab_savings_tariffs (
      id UUID PRIMARY KEY,
      effective_month VARCHAR(7) NOT NULL UNIQUE,
      monthly_fee NUMERIC(18, 2) NOT NULL CHECK (monthly_fee > 0),
      created_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tab_savings_members (
      warga_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      active_from_month VARCHAR(7) NOT NULL DEFAULT '2026-01',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by UUID REFERENCES users(id)
    )
  `);
  await pool.query(`ALTER TABLE tab_savings_members ADD COLUMN IF NOT EXISTS active_from_month VARCHAR(7) NOT NULL DEFAULT '2026-01'`);
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
      per_warga_amount NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (per_warga_amount >= 0),
      charged_total NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (charged_total >= 0),
      surplus_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
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
  await pool.query(`ALTER TABLE tab_events ADD COLUMN IF NOT EXISTS per_warga_amount NUMERIC(18, 2) NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE tab_events ADD COLUMN IF NOT EXISTS charged_total NUMERIC(18, 2) NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE tab_events ADD COLUMN IF NOT EXISTS surplus_amount NUMERIC(18, 2) NOT NULL DEFAULT 0`);

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
      month_key VARCHAR(7),
      amount NUMERIC(18, 2) NOT NULL CHECK (amount >= 0),
      description TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
      created_by UUID NOT NULL REFERENCES users(id),
      approved_by UUID REFERENCES users(id),
      approved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE tab_ledger ADD COLUMN IF NOT EXISTS month_key VARCHAR(7)`);
  await pool.query(`
    UPDATE tab_ledger
    SET month_key = COALESCE(
      CASE
        WHEN LOWER(COALESCE(description, '')) LIKE '%januari 2026%' THEN '2026-01'
        WHEN LOWER(COALESCE(description, '')) LIKE '%februari 2026%' THEN '2026-02'
        WHEN LOWER(COALESCE(description, '')) LIKE '%maret 2026%' THEN '2026-03'
        WHEN LOWER(COALESCE(description, '')) LIKE '%april 2026%' THEN '2026-04'
        WHEN LOWER(COALESCE(description, '')) LIKE '%mei 2026%' THEN '2026-05'
        WHEN LOWER(COALESCE(description, '')) LIKE '%juni 2026%' THEN '2026-06'
        WHEN LOWER(COALESCE(description, '')) LIKE '%juli 2026%' THEN '2026-07'
        WHEN LOWER(COALESCE(description, '')) LIKE '%agustus 2026%' THEN '2026-08'
        WHEN LOWER(COALESCE(description, '')) LIKE '%september 2026%' THEN '2026-09'
        WHEN LOWER(COALESCE(description, '')) LIKE '%oktober 2026%' THEN '2026-10'
        WHEN LOWER(COALESCE(description, '')) LIKE '%november 2026%' THEN '2026-11'
        WHEN LOWER(COALESCE(description, '')) LIKE '%desember 2026%' THEN '2026-12'
        ELSE NULL
      END,
      TO_CHAR(created_at, 'YYYY-MM')
    )
    WHERE month_key IS NULL
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS tab_ledger_month_warga_idx ON tab_ledger (month_key, warga_id)`);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS tab_ledger_warga_idx ON tab_ledger (warga_id, created_at DESC)
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'tab_ledger'
          AND c.conname = 'tab_ledger_amount_check'
      ) THEN
        ALTER TABLE tab_ledger DROP CONSTRAINT tab_ledger_amount_check;
      END IF;
      ALTER TABLE tab_ledger
        ADD CONSTRAINT tab_ledger_amount_check CHECK (amount >= 0);
    END $$;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS tab_event_allocations_event_idx ON tab_event_allocations (event_id)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tab_cash_posts (
      id UUID PRIMARY KEY,
      event_id UUID REFERENCES tab_events(id) ON DELETE SET NULL,
      post_date DATE NOT NULL DEFAULT CURRENT_DATE,
      direction VARCHAR(10) NOT NULL CHECK (direction IN ('CREDIT', 'DEBIT')),
      amount NUMERIC(18, 2) NOT NULL CHECK (amount >= 0),
      description TEXT NOT NULL,
      created_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS tab_cash_posts_date_idx ON tab_cash_posts (post_date DESC, created_at DESC)
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

  const seed = await pool.query(`SELECT 1 FROM tab_savings_tariffs LIMIT 1`);
  if (!seed.rowCount) {
    await pool.query(
      `INSERT INTO tab_savings_tariffs (id, effective_month, monthly_fee, created_by)
       SELECT $1, TO_CHAR(CURRENT_DATE, 'YYYY-MM'), $2, id
       FROM users
       ORDER BY created_at ASC
       LIMIT 1`,
      [randomUUID(), TABUNGAN_MINIMUM_FEE]
    );
  }
}

export async function ensureTabunganMembersFromEligible() {
  await ensureTabunganTables();
  await pool.query(
    `INSERT INTO tab_savings_members (warga_id, is_active)
     WITH warga_role AS (
       SELECT DISTINCT u.id
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE LOWER(TRIM(r.name)) = 'warga'
         AND ${ELIGIBLE_USERS_CLAUSE}
     ),
     eligible_all AS (
       SELECT u.id FROM users u WHERE ${ELIGIBLE_USERS_CLAUSE}
     ),
     warga_final AS (
       SELECT id FROM warga_role
       UNION
       SELECT id FROM eligible_all
       WHERE NOT EXISTS (SELECT 1 FROM warga_role)
     )
     SELECT id, TRUE FROM warga_final
     ON CONFLICT (warga_id) DO NOTHING`
  );
}

export async function listTabunganMembers() {
  await ensureTabunganMembersFromEligible();
  const result = await pool.query(
    `SELECT
       u.id::text AS warga_id,
       u.nama,
       COALESCE(sm.is_active, FALSE) AS is_active,
       COALESCE(sm.active_from_month, '2026-01') AS active_from_month
     FROM users u
     LEFT JOIN tab_savings_members sm ON sm.warga_id = u.id
     WHERE ${ELIGIBLE_USERS_CLAUSE}
     ORDER BY u.nama ASC`
  );
  return result.rows.map((row) => ({ ...row, is_active: Boolean(row.is_active), active_from_month: String(row.active_from_month || '2026-01') }));
}

export async function setTabunganMemberActive({ wargaId, isActive, activeFromMonth = '2026-01', updatedBy }) {
  await ensureTabunganTables();
  await pool.query(
    `INSERT INTO tab_savings_members (warga_id, is_active, active_from_month, updated_at, updated_by)
     VALUES ($1::uuid, $2::boolean, $3, NOW(), $4::uuid)
     ON CONFLICT (warga_id)
     DO UPDATE SET
       is_active = EXCLUDED.is_active,
       active_from_month = EXCLUDED.active_from_month,
       updated_at = NOW(),
       updated_by = EXCLUDED.updated_by`,
    [wargaId, isActive, activeFromMonth, updatedBy]
  );
  return { warga_id: wargaId, is_active: Boolean(isActive), active_from_month: activeFromMonth };
}

export async function listTabunganTariffs() {
  await ensureTabunganTables();
  const result = await pool.query(
    `SELECT id::text, effective_month, monthly_fee
     FROM tab_savings_tariffs
     ORDER BY effective_month DESC`
  );
  return result.rows.map((row) => ({ ...row, monthly_fee: Number(row.monthly_fee || 0) }));
}

export async function setTabunganTariff({ effectiveMonth, monthlyFee, createdBy }) {
  await ensureTabunganTables();
  await pool.query(
    `INSERT INTO tab_savings_tariffs (id, effective_month, monthly_fee, created_by)
     VALUES ($1, $2, $3, $4::uuid)
     ON CONFLICT (effective_month)
     DO UPDATE SET monthly_fee = EXCLUDED.monthly_fee`,
    [randomUUID(), effectiveMonth, monthlyFee, createdBy]
  );
}

export async function getTabunganMinimumFee(month) {
  await ensureTabunganTables();
  const result = await pool.query(
    `SELECT monthly_fee
     FROM tab_savings_tariffs
     WHERE effective_month <= $1
     ORDER BY effective_month DESC
     LIMIT 1`,
    [month]
  );
  return Number(result.rows[0]?.monthly_fee || TABUNGAN_MINIMUM_FEE);
}

export async function listTabunganWargaSummary(month = null) {
  await ensureTabunganMembersFromEligible();
  const migrationBalanceMap = await getTabunganMigrationBalanceByWarga();
  const monthKey = typeof month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
    ? month
    : new Date().toISOString().slice(0, 7);
  const result = await pool.query(
    `SELECT
       u.id::text AS warga_id,
       u.nama,
       COALESCE(sa.total_balance, 0) AS total_balance,
       lp.id::text AS last_credit_id,
       lp.amount AS last_credit_amount,
       lp.description AS last_credit_description,
       lp.created_at AS last_credit_created_at
     FROM tab_savings_members sm
     JOIN users u ON u.id = sm.warga_id
     LEFT JOIN tab_savings_accounts sa ON sa.warga_id = u.id
     LEFT JOIN LATERAL (
       SELECT l.id, l.amount, l.description, l.created_at
       FROM tab_ledger l
       WHERE l.warga_id = u.id
         AND l.direction = 'CREDIT'
         AND l.status = 'APPROVED'
         AND l.month_key = $1
       ORDER BY l.created_at DESC
       LIMIT 1
     ) lp ON TRUE
     WHERE sm.is_active = TRUE
       AND COALESCE(sm.active_from_month, '2026-01') <= $1
     ORDER BY u.nama ASC`,
    [monthKey]
  );
  return result.rows.map((r) => ({
    warga_id: String(r.warga_id),
    nama: String(r.nama || ''),
    total_balance: Number(r.total_balance || 0) + Number(migrationBalanceMap.get(String(r.warga_id)) || 0),
    last_credit: r.last_credit_id
      ? {
        id: String(r.last_credit_id),
        amount: Number(r.last_credit_amount || 0),
        description: String(r.last_credit_description || ''),
        created_at: r.last_credit_created_at
      }
      : null
  }));
}

export async function getTabunganCashSummary() {
  await ensureTabunganTables();
  const result = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END), 0) AS sisa_kas_kegiatan
     FROM tab_cash_posts`
  );
  return { sisa_kas_kegiatan: Number(result.rows[0]?.sisa_kas_kegiatan || 0) };
}

export async function getTabunganDanaSummary() {
  await ensureTabunganMembersFromEligible();
  const migrationBalanceMap = await getTabunganMigrationBalanceByWarga();
  const result = await pool.query(
    `SELECT
       sm.warga_id::text AS warga_id,
       COALESCE(sa.total_balance, 0) AS total_balance
     FROM tab_savings_members sm
     LEFT JOIN tab_savings_accounts sa ON sa.warga_id = sm.warga_id
     WHERE sm.is_active = TRUE`
  );
  const cashResult = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END), 0) AS sisa_kas_kegiatan
     FROM tab_cash_posts`
  );
  const totalSaldoWarga = result.rows.reduce((sum, row) => {
    const saldoWarga = Number(row.total_balance || 0) + Number(migrationBalanceMap.get(String(row.warga_id)) || 0);
    return sum + Math.max(saldoWarga, 0);
  }, 0);
  const sisaKasKegiatan = Number(cashResult.rows[0]?.sisa_kas_kegiatan || 0);
  return {
    total_saldo_warga: totalSaldoWarga,
    sisa_kas_kegiatan: sisaKasKegiatan,
    total_kas_dana: totalSaldoWarga + sisaKasKegiatan
  };
}

export async function getTabunganBalanceByWarga({ wargaId }) {
  await ensureTabunganTables();
  const migrationBalance = await getTabunganMigrationBalanceByWarga({ wargaId });
  const result = await pool.query(
    `SELECT
       COALESCE(sa.total_balance, 0) AS total_balance,
       COALESCE(sm.is_active, FALSE) AS is_active
     FROM users u
     LEFT JOIN tab_savings_accounts sa ON sa.warga_id = u.id
     LEFT JOIN tab_savings_members sm ON sm.warga_id = u.id
     WHERE u.id = $1::uuid
     LIMIT 1`,
    [wargaId]
  );
  const row = result.rows[0] || {};
  return {
    warga_id: String(wargaId),
    is_active: Boolean(row.is_active),
    total_balance: Number(row.total_balance || 0) + Number(migrationBalance || 0),
    current_balance: Number(row.total_balance || 0),
    migration_balance: Number(migrationBalance || 0)
  };
}

export async function getTabunganOpeningBalances({ year = 2025 } = {}) {
  await ensureTabunganTables();
  const tableName = `mig_tabungan_ledger_${Number(year) || 2025}`;
  const exists = await pool.query(`SELECT to_regclass($1) AS table_name`, [`public.${tableName}`]);
  if (!exists.rows[0]?.table_name) return [];

  const result = await pool.query(
    `SELECT
       m.warga_id::text AS warga_id,
       u.nama,
       COALESCE(SUM(m.amount), 0) AS amount,
       MAX(m.updated_at) AS updated_at
     FROM ${tableName} m
     JOIN users u ON u.id = m.warga_id
     GROUP BY m.warga_id::text, u.nama
     ORDER BY u.nama ASC`
  );

  const closingYear = Number(year) || 2025;
  return result.rows.map((row) => ({
    id: `${closingYear}-${row.warga_id}`,
    warga_id: String(row.warga_id),
    tanggal: row.updated_at || `${closingYear}-12-31`,
    closing_year: closingYear,
    opening_year: closingYear + 1,
    amount: Number(row.amount || 0),
    description: `Saldo awal migrasi tabungan ${row.nama || row.warga_id} dari Desember ${closingYear}`
  }));
}

export async function getTabunganMigrationBalanceByWarga({ year = 2025, wargaId = '' } = {}) {
  await ensureTabunganTables();
  const tableName = `mig_tabungan_ledger_${Number(year) || 2025}`;
  const exists = await pool.query(`SELECT to_regclass($1) AS table_name`, [`public.${tableName}`]);
  if (!exists.rows[0]?.table_name) return wargaId ? 0 : new Map();

  const params = [];
  let where = '';
  if (wargaId) {
    params.push(wargaId);
    where = 'WHERE warga_id = $1::uuid';
  }

  const result = await pool.query(
    `SELECT warga_id::text AS warga_id, COALESCE(SUM(amount), 0) AS amount
     FROM ${tableName}
     ${where}
     GROUP BY warga_id::text`,
    params
  );

  if (wargaId) return Number(result.rows[0]?.amount || 0);
  return new Map(result.rows.map((row) => [String(row.warga_id), Number(row.amount || 0)]));
}

export async function inputTabunganSetoran({ wargaId, amount, description, monthKey, createdBy }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const member = await client.query(
      `SELECT 1
       FROM tab_savings_members
       WHERE warga_id = $1::uuid
         AND is_active = TRUE
         AND COALESCE(active_from_month, '2026-01') <= $2`,
      [wargaId, monthKey]
    );
    if (!member.rowCount) throw new Error('Warga bukan anggota tabungan aktif');

    await client.query(
      `INSERT INTO tab_savings_accounts (id, warga_id, total_balance)
       VALUES ($1, $2::uuid, 0)
       ON CONFLICT (warga_id) DO NOTHING`,
      [randomUUID(), wargaId]
    );

    await client.query(
      `INSERT INTO tab_ledger
       (id, warga_id, tx_type, direction, month_key, amount, description, status, created_by, approved_by, approved_at)
       VALUES ($1, $2::uuid, 'DEPOSIT', 'CREDIT', $3, $4, $5, 'APPROVED', $6::uuid, $6::uuid, NOW())`,
      [randomUUID(), wargaId, monthKey, amount, description, createdBy]
    );

    await client.query(
      `UPDATE tab_savings_accounts
       SET total_balance = total_balance + $1,
           updated_at = NOW()
       WHERE warga_id = $2::uuid`,
      [amount, wargaId]
    );

    const balanceResult = await client.query(
      `SELECT COALESCE(total_balance, 0) AS total_balance
       FROM tab_savings_accounts
       WHERE warga_id = $1::uuid`,
      [wargaId]
    );

    await client.query('COMMIT');
    const migrationBalance = await getTabunganMigrationBalanceByWarga({ wargaId });
    return {
      warga_id: wargaId,
      amount: Number(amount || 0),
      total_balance: Number(balanceResult.rows[0]?.total_balance || 0) + Number(migrationBalance || 0)
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateTabunganSetoran({ ledgerId, amount, description, monthKey }) {
  await ensureTabunganTables();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT id::text, warga_id::text, amount
       FROM tab_ledger
       WHERE id = $1::uuid
         AND direction = 'CREDIT'
         AND tx_type = 'DEPOSIT'
         AND status = 'APPROVED'
       FOR UPDATE`,
      [ledgerId]
    );
    if (!existing.rowCount) throw new Error('Data setoran tabungan tidak ditemukan');
    const row = existing.rows[0];
    const oldAmount = Number(row.amount || 0);
    const delta = Number(amount || 0) - oldAmount;
    await client.query(
      `UPDATE tab_ledger
       SET amount = $2,
           description = COALESCE($3, description),
           month_key = COALESCE($4, month_key)
       WHERE id = $1::uuid`,
      [ledgerId, amount, description || null, monthKey || null]
    );
    await client.query(
      `UPDATE tab_savings_accounts
       SET total_balance = total_balance + $1,
           updated_at = NOW()
       WHERE warga_id = $2::uuid`,
      [delta, row.warga_id]
    );
    const balanceResult = await client.query(
      `SELECT COALESCE(total_balance, 0) AS total_balance
       FROM tab_savings_accounts
       WHERE warga_id = $1::uuid`,
      [row.warga_id]
    );
    await client.query('COMMIT');
    const migrationBalance = await getTabunganMigrationBalanceByWarga({ wargaId: row.warga_id });
    return {
      id: String(row.id),
      warga_id: String(row.warga_id),
      amount: Number(amount || 0),
      old_amount: oldAmount,
      delta,
      total_balance: Number(balanceResult.rows[0]?.total_balance || 0) + Number(migrationBalance || 0)
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createTabunganEvent({ title, eventDate, totalAmount, perWargaAmount, notes, createdBy }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const eventId = randomUUID();

    const wargaRows = await client.query(
      `SELECT sm.warga_id::text AS warga_id
       FROM tab_savings_members sm
       JOIN users u ON u.id = sm.warga_id
       WHERE sm.is_active = TRUE
       ORDER BY u.nama ASC`
    );

    const wargaIds = wargaRows.rows.map((r) => String(r.warga_id));
    if (!wargaIds.length) throw new Error('Data warga kosong');

    const actualTotal = Number(totalAmount || 0);
    const finalPerWarga = Number(perWargaAmount || 0);
    if (!Number.isFinite(finalPerWarga) || finalPerWarga <= 0) throw new Error('Nominal final per warga tidak valid');
    const chargedTotal = Number((finalPerWarga * wargaIds.length).toFixed(2));
    const surplusAmount = Number((chargedTotal - actualTotal).toFixed(2));

    await client.query(
      `INSERT INTO tab_events
       (id, title, event_date, total_amount, per_warga_amount, charged_total, surplus_amount, notes, status, created_by, approved_by, approved_at)
       VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, 'POSTED', $9::uuid, $9::uuid, NOW())`,
      [eventId, title, eventDate, actualTotal, finalPerWarga, chargedTotal, surplusAmount, notes || null, createdBy]
    );

    for (const wargaId of wargaIds) {
      const allocAmount = finalPerWarga;

      const saldoRow = await client.query(
        `SELECT COALESCE(total_balance, 0) AS total_balance
         FROM tab_savings_accounts
         WHERE warga_id = $1::uuid`,
        [wargaId]
      );
      const saldo = Number(saldoRow.rows[0]?.total_balance || 0);
      const covered = allocAmount;
      const outstanding = 0;
      const status = Number((saldo - allocAmount).toFixed(2)) >= 0 ? 'SETTLED' : 'DEFICIT';

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
           (id, warga_id, event_id, source_allocation_id, tx_type, direction, month_key, amount, description, status, created_by, approved_by, approved_at)
           VALUES ($1, $2::uuid, $3::uuid, $4::uuid, 'ALLOCATE', 'DEBIT', TO_CHAR($5::date, 'YYYY-MM'), $6, $7, 'APPROVED', $8::uuid, $8::uuid, NOW())`,
          [randomUUID(), wargaId, eventId, allocationId, eventDate, covered, `Potongan kegiatan pembangunan: ${title}`, createdBy]
        );

        await client.query(
          `INSERT INTO tab_savings_accounts (id, warga_id, total_balance)
           VALUES ($1, $2::uuid, 0)
           ON CONFLICT (warga_id) DO NOTHING`,
          [randomUUID(), wargaId]
        );

        await client.query(
          `UPDATE tab_savings_accounts
           SET total_balance = total_balance - $1,
               updated_at = NOW()
           WHERE warga_id = $2::uuid`,
          [covered, wargaId]
        );
      }
    }

    if (surplusAmount > 0) {
      await client.query(
        `INSERT INTO tab_cash_posts (id, event_id, post_date, direction, amount, description, created_by)
         VALUES ($1, $2::uuid, $3::date, 'CREDIT', $4, $5, $6::uuid)`,
        [randomUUID(), eventId, eventDate, surplusAmount, `Sisa kegiatan ${title}`, createdBy]
      );
    }

    await client.query('COMMIT');
    return { event_id: eventId, warga_count: wargaIds.length, per_warga_amount: finalPerWarga, charged_total: chargedTotal, surplus_amount: surplusAmount };
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
      `SELECT id::text AS id, title, event_date, total_amount, per_warga_amount, charged_total, surplus_amount, notes, status, created_at
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
         l.created_at,
         l.month_key
       FROM tab_ledger l
       JOIN users u ON u.id = l.warga_id
       WHERE l.month_key = $1
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
         l.created_at,
         l.month_key
       FROM tab_ledger l
       JOIN users u ON u.id = l.warga_id
       WHERE l.month_key = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
       ORDER BY l.created_at DESC`
    );
  return result.rows;
}

export async function getLatestTabunganLedgerMonth() {
  await ensureTabunganTables();
  const result = await pool.query(
    `SELECT MAX(month_key) AS month
     FROM tab_ledger`
  );
  return String(result.rows[0]?.month || '');
}

export async function closeTabunganYear({ year }) {
  await pool.query(
    `INSERT INTO tab_yearly_balances (id, year, warga_id, closing_balance, updated_at)
     SELECT gen_random_uuid(), $1, u.id, COALESCE(sa.total_balance, 0), NOW()
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     LEFT JOIN tab_savings_accounts sa ON sa.warga_id = u.id
     WHERE LOWER(TRIM(r.name)) = 'warga'
       AND ${ELIGIBLE_USERS_CLAUSE}
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
