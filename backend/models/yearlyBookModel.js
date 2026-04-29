import { pool } from '../db.js';

const IURAN_WAJIB_TARGET = 30000;

export async function ensureYearlyBookTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS accounting_periods (
      year INTEGER PRIMARY KEY,
      status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
      opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      opened_by TEXT,
      closed_at TIMESTAMPTZ,
      closed_by TEXT,
      notes TEXT
    )
  `);

  await pool.query(`
    ALTER TABLE accounting_periods
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
      ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS opened_by TEXT,
      ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS closed_by TEXT,
      ADD COLUMN IF NOT EXISTS notes TEXT
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS yearly_wallet_balances (
      id BIGSERIAL PRIMARY KEY,
      year INTEGER NOT NULL,
      wallet_id UUID NOT NULL,
      opening_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
      closing_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (year, wallet_id)
    )
  `);

  await pool.query(`
    ALTER TABLE yearly_wallet_balances
      ADD COLUMN IF NOT EXISTS year INTEGER,
      ADD COLUMN IF NOT EXISTS wallet_id UUID,
      ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS closing_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);

  // UUID migration safety for legacy schemas that created wallet_id as INTEGER/TEXT.
  await pool.query(`
    ALTER TABLE yearly_wallet_balances
      ALTER COLUMN wallet_id DROP NOT NULL
  `);
  await pool.query(`
    ALTER TABLE yearly_wallet_balances
      ALTER COLUMN wallet_id TYPE UUID
      USING (
        CASE
          WHEN TRIM(wallet_id::text) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN TRIM(wallet_id::text)::uuid
          ELSE NULL
        END
      )
  `);
  await pool.query(`
    DELETE FROM yearly_wallet_balances
    WHERE wallet_id IS NULL
  `);
  await pool.query(`
    ALTER TABLE yearly_wallet_balances
      ALTER COLUMN wallet_id SET NOT NULL
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS yearly_wallet_balances_year_wallet_uidx
      ON yearly_wallet_balances (year, wallet_id)
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name = 'yearly_wallet_balances'
          AND constraint_name = 'yearly_wallet_balances_wallet_id_fkey'
      ) THEN
        ALTER TABLE yearly_wallet_balances
          ADD CONSTRAINT yearly_wallet_balances_wallet_id_fkey
          FOREIGN KEY (wallet_id) REFERENCES wallets(id)
          ON UPDATE CASCADE
          ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS yearly_warga_arrears (
      id BIGSERIAL PRIMARY KEY,
      year INTEGER NOT NULL,
      warga_id UUID,
      opening_arrears NUMERIC(18,2) NOT NULL DEFAULT 0,
      closing_arrears NUMERIC(18,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (year, warga_id)
    )
  `);

  await pool.query(`
    ALTER TABLE yearly_warga_arrears
      ADD COLUMN IF NOT EXISTS year INTEGER,
      ADD COLUMN IF NOT EXISTS warga_id UUID,
      ADD COLUMN IF NOT EXISTS opening_arrears NUMERIC(18,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS closing_arrears NUMERIC(18,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);

  // Legacy-safe migration: allow old integer/text warga_id and convert only valid UUID strings.
  await pool.query(`
    ALTER TABLE yearly_warga_arrears
      ALTER COLUMN warga_id DROP NOT NULL
  `);
  await pool.query(`
    ALTER TABLE yearly_warga_arrears
      ALTER COLUMN warga_id TYPE UUID
      USING (
        CASE
          WHEN TRIM(warga_id::text) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN TRIM(warga_id::text)::uuid
          ELSE NULL
        END
      )
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS yearly_warga_arrears_year_warga_uidx
      ON yearly_warga_arrears (year, warga_id)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS yearly_warga_contribution_arrears (
      id BIGSERIAL PRIMARY KEY,
      year INTEGER NOT NULL,
      warga_id UUID NOT NULL,
      contribution_type_id INTEGER NOT NULL,
      opening_arrears NUMERIC(18,2) NOT NULL DEFAULT 0,
      closing_arrears NUMERIC(18,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (year, warga_id, contribution_type_id)
    )
  `);

  await pool.query(`
    ALTER TABLE yearly_warga_contribution_arrears
      ADD COLUMN IF NOT EXISTS year INTEGER,
      ADD COLUMN IF NOT EXISTS warga_id UUID,
      ADD COLUMN IF NOT EXISTS contribution_type_id INTEGER,
      ADD COLUMN IF NOT EXISTS opening_arrears NUMERIC(18,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS closing_arrears NUMERIC(18,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS yearly_warga_contrib_arrears_uidx
      ON yearly_warga_contribution_arrears (year, warga_id, contribution_type_id)
  `);
}

function toYearStart(year) {
  return `${year}-01-01`;
}

function toNextYearStart(year) {
  return `${year + 1}-01-01`;
}

export async function getYearlyBookSummary(year) {
  try {
    await ensureYearlyBookTables();
  } catch (_error) {
    // Keep endpoint alive for legacy schemas; summary can still be shown as empty.
  }

  try {
    const periodResult = await pool.query(
    `SELECT year, status, opened_at, opened_by, closed_at, closed_by
     FROM accounting_periods
     WHERE year = $1
     LIMIT 1`,
    [year]
  );
    const walletsResult = await pool.query(
    `SELECT y.wallet_id, w.name AS wallet_name, y.opening_balance, y.closing_balance
     FROM yearly_wallet_balances y
     LEFT JOIN wallets w ON w.id = y.wallet_id
     WHERE y.year = $1
     ORDER BY w.name ASC`,
    [year]
  );
    const arrearsResult = await pool.query(
    `SELECT
       COUNT(*) AS total_warga,
       COALESCE(SUM(opening_arrears), 0) AS total_opening_arrears,
       COALESCE(SUM(closing_arrears), 0) AS total_closing_arrears
     FROM yearly_warga_arrears
     WHERE year = $1`,
    [year]
  );
    const topArrearsResult = await pool.query(
    `SELECT y.warga_id::text AS warga_id, y.closing_arrears
     FROM yearly_warga_arrears y
     WHERE y.year = $1
       AND y.closing_arrears > 0
     ORDER BY y.closing_arrears DESC
     LIMIT 10`,
    [year]
  );

    const topIds = topArrearsResult.rows
      .map((row) => String(row.warga_id || '').trim())
      .filter((id) => id !== '');

    const usersById = new Map();
    if (topIds.length > 0) {
      try {
        const usersResult = await pool.query(
          `SELECT id::text AS id, nama, no_hp
           FROM users
           WHERE id::text = ANY($1::text[])`,
          [topIds]
        );
        usersResult.rows.forEach((row) => {
          usersById.set(String(row.id), { nama: row.nama, no_hp: row.no_hp });
        });
      } catch (_error) {
        // Ignore users lookup failure and continue with fallback names.
      }
    }

    return {
      period: periodResult.rows[0] || null,
      wallets: walletsResult.rows.map((row) => ({
        wallet_id: row.wallet_id,
        wallet_name: row.wallet_name,
        opening_balance: Number(row.opening_balance || 0),
        closing_balance: Number(row.closing_balance || 0)
      })),
      arrears: {
        total_warga: Number(arrearsResult.rows[0]?.total_warga || 0),
        total_opening_arrears: Number(arrearsResult.rows[0]?.total_opening_arrears || 0),
        total_closing_arrears: Number(arrearsResult.rows[0]?.total_closing_arrears || 0),
        top10: topArrearsResult.rows.map((row) => {
          const user = usersById.get(String(row.warga_id));
          return {
            warga_id: row.warga_id,
            nama: user?.nama || '-',
            no_hp: user?.no_hp || null,
            closing_arrears: Number(row.closing_arrears || 0)
          };
        })
      }
    };
  } catch (error) {
    if (String(error?.message || '').toLowerCase().includes('operator does not exist: uuid = integer')) {
      return {
        period: null,
        wallets: [],
        arrears: {
          total_warga: 0,
          total_opening_arrears: 0,
          total_closing_arrears: 0,
          top10: []
        },
        warning: 'Legacy UUID/integer mismatch terdeteksi pada skema lama'
      };
    }
    throw error;
  }
}

export async function closeYearlyBook({ year, actor }) {
  await ensureYearlyBookTables();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT year, status
       FROM accounting_periods
       WHERE year = $1
       LIMIT 1`,
      [year]
    );
    if (existing.rows.length > 0 && String(existing.rows[0].status).toUpperCase() === 'CLOSED') {
      throw new Error(`Periode ${year} sudah ditutup`);
    }

    await client.query(
      `INSERT INTO accounting_periods (year, status, opened_by)
       VALUES ($1, 'OPEN', $2)
       ON CONFLICT (year) DO NOTHING`,
      [year, actor]
    );

    const walletBalances = await client.query(
      `SELECT
         w.id AS wallet_id,
         COALESCE(SUM(
           CASE
             WHEN t.target_wallet_id = w.id THEN t.amount
             WHEN t.source_wallet_id = w.id THEN -t.amount
             ELSE 0
           END
         ), 0) AS closing_balance
       FROM wallets w
       LEFT JOIN transactions t
         ON (t.target_wallet_id = w.id OR t.source_wallet_id = w.id)
        AND t.status = 'APPROVED'
        AND t.created_at < $1::date
       GROUP BY w.id`,
      [toNextYearStart(year)]
    );

    for (const row of walletBalances.rows) {
      await client.query(
        `INSERT INTO yearly_wallet_balances (year, wallet_id, closing_balance)
         VALUES ($1, $2, $3)
         ON CONFLICT (year, wallet_id) DO UPDATE
         SET closing_balance = EXCLUDED.closing_balance`,
        [year, row.wallet_id, row.closing_balance]
      );
    }

    const arrearsRows = await client.query(
      `WITH warga AS (
         SELECT DISTINCT u.id AS warga_id
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id
         WHERE LOWER(TRIM(r.name)) = 'warga'
         UNION
         SELECT u2.id AS warga_id
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
       iuran_tahun AS (
         SELECT it.warga_id AS warga_id, COALESCE(SUM(it.amount), 0) AS total
         FROM iuran_transactions it
         JOIN contribution_types ct ON ct.id = it.contribution_type_id
         WHERE LOWER(TRIM(ct.name)) = 'iuran wajib'
           AND it.tanggal >= $1::date
           AND it.tanggal < $2::date
         GROUP BY it.warga_id
       )
       SELECT
         w.warga_id,
         GREATEST((12 * $3) - COALESCE(i.total, 0), 0) AS closing_arrears
       FROM warga w
       LEFT JOIN iuran_tahun i ON i.warga_id = w.warga_id`,
      [toYearStart(year), toNextYearStart(year), IURAN_WAJIB_TARGET]
    );

    for (const row of arrearsRows.rows) {
      await client.query(
        `INSERT INTO yearly_warga_arrears (year, warga_id, closing_arrears)
         VALUES ($1, $2, $3)
         ON CONFLICT (year, warga_id) DO UPDATE
         SET closing_arrears = EXCLUDED.closing_arrears`,
        [year, row.warga_id, row.closing_arrears]
      );
    }

    await client.query(
      `UPDATE accounting_periods
       SET status = 'CLOSED',
           closed_at = NOW(),
           closed_by = $2
       WHERE year = $1`,
      [year, actor]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function openYearlyBook({ year, actor }) {
  await ensureYearlyBookTables();
  const previousYear = year - 1;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const prevPeriod = await client.query(
      `SELECT status
       FROM accounting_periods
       WHERE year = $1
       LIMIT 1`,
      [previousYear]
    );
    if (prevPeriod.rows.length === 0 || String(prevPeriod.rows[0].status).toUpperCase() !== 'CLOSED') {
      throw new Error(`Periode ${previousYear} belum ditutup. Lakukan closing dulu.`);
    }

    await client.query(
      `INSERT INTO accounting_periods (year, status, opened_by, opened_at)
       VALUES ($1, 'OPEN', $2, NOW())
       ON CONFLICT (year) DO UPDATE
       SET status = 'OPEN',
           opened_by = EXCLUDED.opened_by,
           opened_at = EXCLUDED.opened_at`,
      [year, actor]
    );

    const prevWallets = await client.query(
      `SELECT wallet_id, closing_balance
       FROM yearly_wallet_balances
       WHERE year = $1`,
      [previousYear]
    );
    for (const row of prevWallets.rows) {
      await client.query(
        `INSERT INTO yearly_wallet_balances (year, wallet_id, opening_balance)
         VALUES ($1, $2, $3)
         ON CONFLICT (year, wallet_id) DO UPDATE
         SET opening_balance = EXCLUDED.opening_balance`,
        [year, row.wallet_id, row.closing_balance]
      );
    }

    const prevArrears = await client.query(
      `SELECT warga_id, closing_arrears
       FROM yearly_warga_arrears
       WHERE year = $1`,
      [previousYear]
    );
    for (const row of prevArrears.rows) {
      await client.query(
        `INSERT INTO yearly_warga_arrears (year, warga_id, opening_arrears)
         VALUES ($1, $2, $3)
         ON CONFLICT (year, warga_id) DO UPDATE
         SET opening_arrears = EXCLUDED.opening_arrears`,
        [year, row.warga_id, row.closing_arrears]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
