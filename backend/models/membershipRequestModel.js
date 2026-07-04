import { randomUUID } from 'crypto';
import { pool } from '../db.js';

const MODULES = ['internet', 'lingkungan', 'koperasi'];
const MODULE_LABELS = {
  internet: 'Internet',
  lingkungan: 'Lingkungan',
  koperasi: 'Koperasi'
};

export function normalizeMembershipModule(moduleKey) {
  const normalized = String(moduleKey || '').trim().toLowerCase();
  if (!MODULES.includes(normalized)) return '';
  return normalized;
}

export function getMembershipModuleLabel(moduleKey) {
  return MODULE_LABELS[normalizeMembershipModule(moduleKey)] || moduleKey;
}

export function getMembershipAdminRoles(moduleKey) {
  const module = normalizeMembershipModule(moduleKey);
  if (module === 'internet') return ['Admin Internet', 'root'];
  if (module === 'lingkungan') return ['Admin Lingkungan', 'root'];
  if (module === 'koperasi') return ['Admin Koperasi', 'root'];
  return ['root'];
}

export async function ensureMembershipRequestTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS membership_requests (
      id UUID PRIMARY KEY,
      module_key VARCHAR(30) NOT NULL CHECK (module_key IN ('internet','lingkungan','koperasi')),
      warga_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_type VARCHAR(20) NOT NULL DEFAULT 'ACTIVATE' CHECK (request_type IN ('ACTIVATE','DEACTIVATE')),
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
      note TEXT,
      requested_by UUID NOT NULL REFERENCES users(id),
      reviewed_by UUID REFERENCES users(id),
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE membership_requests ADD COLUMN IF NOT EXISTS request_type VARCHAR(20) NOT NULL DEFAULT 'ACTIVATE'`);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'membership_requests'
          AND c.conname = 'membership_requests_request_type_check'
      ) THEN
        ALTER TABLE membership_requests
          ADD CONSTRAINT membership_requests_request_type_check
          CHECK (request_type IN ('ACTIVATE','DEACTIVATE'));
      END IF;
    END $$;
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS membership_requests_pending_unique
    ON membership_requests (module_key, warga_id)
    WHERE status = 'PENDING'
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS membership_requests_module_status_idx
    ON membership_requests (module_key, status, created_at DESC)
  `);
}

export async function getMyMembershipRequests(userId) {
  await ensureMembershipRequestTables();
  const { rows } = await pool.query(
    `SELECT id::text, module_key, request_type, status, note, created_at, reviewed_at
     FROM membership_requests
     WHERE warga_id = $1::uuid
       AND module_key = ANY($2::text[])
     ORDER BY created_at DESC`,
    [userId, MODULES]
  );
  return rows;
}

export async function getLatestMembershipRequestStatusMap(userId) {
  const rows = await getMyMembershipRequests(userId);
  const map = {};
  for (const row of rows) {
    if (!map[row.module_key]) {
      map[row.module_key] = {
        id: row.id,
        request_type: row.request_type || 'ACTIVATE',
        status: row.status,
        note: row.note || '',
        created_at: row.created_at,
        reviewed_at: row.reviewed_at
      };
    }
  }
  return map;
}

export async function createMembershipRequest({ moduleKey, wargaId, requestedBy, note = '', requestType = 'ACTIVATE' }) {
  const module = normalizeMembershipModule(moduleKey);
  if (!module) throw new Error('module invalid');
  const normalizedType = String(requestType || '').trim().toUpperCase();
  if (!['ACTIVATE', 'DEACTIVATE'].includes(normalizedType)) throw new Error('request_type invalid');
  await ensureMembershipRequestTables();
  const id = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO membership_requests (id, module_key, warga_id, request_type, status, note, requested_by)
     VALUES ($1, $2, $3::uuid, $4, 'PENDING', NULLIF($5, ''), $6::uuid)
     ON CONFLICT (module_key, warga_id) WHERE status = 'PENDING'
     DO UPDATE SET request_type = EXCLUDED.request_type,
                   note = COALESCE(NULLIF(EXCLUDED.note, ''), membership_requests.note),
                   updated_at = NOW()
     RETURNING id::text, module_key, warga_id::text, request_type, status, note, created_at`,
    [id, module, wargaId, normalizedType, note, requestedBy]
  );
  return rows[0];
}

export async function listPendingMembershipRequests(moduleKey) {
  const module = normalizeMembershipModule(moduleKey);
  if (!module) throw new Error('module invalid');
  await ensureMembershipRequestTables();
  const { rows } = await pool.query(
    `SELECT
       mr.id::text,
       mr.module_key,
       mr.request_type,
       mr.status,
       mr.note,
       mr.created_at,
       u.id::text AS warga_id,
       u.nama,
       u.no_hp
     FROM membership_requests mr
     JOIN users u ON u.id = mr.warga_id
     WHERE mr.module_key = $1
       AND mr.status = 'PENDING'
     ORDER BY mr.created_at ASC`,
    [module]
  );
  return rows;
}

export async function getPendingMembershipRequestById(requestId) {
  await ensureMembershipRequestTables();
  const { rows } = await pool.query(
    `SELECT id::text, module_key, warga_id::text, request_type, status
     FROM membership_requests
     WHERE id = $1::uuid
       AND status = 'PENDING'
     LIMIT 1`,
    [requestId]
  );
  return rows[0] || null;
}

export async function reviewMembershipRequest({ requestId, status, reviewedBy }) {
  const nextStatus = String(status || '').trim().toUpperCase();
  if (!['APPROVED', 'REJECTED'].includes(nextStatus)) throw new Error('status invalid');
  await ensureMembershipRequestTables();
  const { rows } = await pool.query(
    `UPDATE membership_requests
     SET status = $2,
         reviewed_by = $3::uuid,
         reviewed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1::uuid
       AND status = 'PENDING'
     RETURNING id::text, module_key, warga_id::text, request_type, status`,
    [requestId, nextStatus, reviewedBy]
  );
  return rows[0] || null;
}
