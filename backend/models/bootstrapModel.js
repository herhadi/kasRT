import { pool } from '../db.js';
import { ensureYearlyBookTables } from './yearlyBookModel.js';

export async function ensureCoreMasterData() {
  await ensureRoles();
  await ensureWallets();
  await ensureContributionTypes();
  await ensureYearlyBookTables();
}

async function ensureRoles() {
  await pool.query(`
    WITH desired(id, name) AS (
      VALUES
        (1, 'Ketua'),
        (2, 'Sekretaris'),
        (3, 'Bendahara'),
        (4, 'Admin Pembangunan'),
        (5, 'Admin Lingkungan'),
        (6, 'Admin Sosial'),
        (7, 'Admin Internet'),
        (8, 'Admin Jimpitan'),
        (9, 'Admin Koperasi'),
        (10, 'Admin Keamanan'),
        (11, 'Warga'),
        (12, 'root')
    )
    UPDATE roles r
    SET name = d.name
    FROM desired d
    WHERE r.id = d.id
      AND r.name <> d.name
      AND NOT EXISTS (
        SELECT 1
        FROM roles rx
        WHERE LOWER(TRIM(rx.name)) = LOWER(TRIM(d.name))
          AND rx.id <> r.id
      )
  `);

  await pool.query(`
    WITH desired(id, name) AS (
      VALUES
        (1, 'Ketua'),
        (2, 'Sekretaris'),
        (3, 'Bendahara'),
        (4, 'Admin Pembangunan'),
        (5, 'Admin Lingkungan'),
        (6, 'Admin Sosial'),
        (7, 'Admin Internet'),
        (8, 'Admin Jimpitan'),
        (9, 'Admin Koperasi'),
        (10, 'Admin Keamanan'),
        (11, 'Warga'),
        (12, 'root')
    )
    INSERT INTO roles (id, name)
    SELECT d.id, d.name
    FROM desired d
    WHERE NOT EXISTS (
      SELECT 1
      FROM roles r
      WHERE r.id = d.id
         OR LOWER(TRIM(r.name)) = LOWER(TRIM(d.name))
    )
  `);
}

async function ensureWallets() {
  await pool.query(`
    INSERT INTO wallets (name)
    SELECT v.name
    FROM (VALUES
      ('Kas Jimpitan'),
      ('Kas Iuran Wajib'),
      ('Kas Sosial')
    ) AS v(name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM wallets w
      WHERE LOWER(w.name) = LOWER(v.name)
    )
  `);
}

async function ensureContributionTypes() {
  await pool.query(`
    INSERT INTO contribution_types (name, is_mandatory)
    SELECT v.name, v.is_mandatory
    FROM (VALUES
      ('Jimpitan', true),
      ('Iuran Wajib', true),
      ('Internet', false),
      ('Lingkungan', false),
      ('Sampah', false),
      ('Iuran Sampah', false),
      ('Pembangunan', false),
      ('Koperasi', false),
      ('Sosial', false),
      ('Keamanan', false)
    ) AS v(name, is_mandatory)
    WHERE NOT EXISTS (
      SELECT 1
      FROM contribution_types c
      WHERE LOWER(c.name) = LOWER(v.name)
    )
  `);

  await pool.query(`
    UPDATE contribution_types c
    SET is_mandatory = v.is_mandatory
    FROM (VALUES
      ('Jimpitan', true),
      ('Iuran Wajib', true),
      ('Internet', false),
      ('Lingkungan', false),
      ('Sampah', false),
      ('Iuran Sampah', false),
      ('Pembangunan', false),
      ('Koperasi', false),
      ('Sosial', false),
      ('Keamanan', false)
    ) AS v(name, is_mandatory)
    WHERE LOWER(c.name) = LOWER(v.name)
  `);
}
