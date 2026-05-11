import { randomUUID } from 'crypto';
import { pool } from '../db.js';

export const KOP_MAX_INTEREST_MONTHLY = 2.5;

export async function ensureKoperasiTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kop_settings (
      id UUID PRIMARY KEY,
      key_name VARCHAR(80) NOT NULL UNIQUE,
      value_json JSONB NOT NULL,
      updated_by UUID REFERENCES users(id),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS kop_members (
      warga_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      joined_at DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS kop_loans (
      id UUID PRIMARY KEY,
      warga_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      principal_amount NUMERIC(18,2) NOT NULL CHECK (principal_amount > 0),
      tenor_months INT NOT NULL CHECK (tenor_months > 0),
      interest_model VARCHAR(20) NOT NULL CHECK (interest_model IN ('FLAT','DECLINING')),
      interest_rate_monthly NUMERIC(6,3) NOT NULL CHECK (interest_rate_monthly > 0 AND interest_rate_monthly <= 2.5),
      rate_locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      disbursed_at DATE,
      status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','ACTIVE','PAID_OFF','DEFAULT','CANCELLED')),
      notes TEXT,
      created_by UUID NOT NULL REFERENCES users(id),
      approved_by UUID REFERENCES users(id),
      approved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS kop_installments (
      id UUID PRIMARY KEY,
      loan_id UUID NOT NULL REFERENCES kop_loans(id) ON DELETE CASCADE,
      installment_no INT NOT NULL CHECK (installment_no > 0),
      due_month VARCHAR(7) NOT NULL,
      due_date DATE NOT NULL,
      principal_due NUMERIC(18,2) NOT NULL DEFAULT 0,
      interest_due NUMERIC(18,2) NOT NULL DEFAULT 0,
      penalty_due NUMERIC(18,2) NOT NULL DEFAULT 0,
      total_due NUMERIC(18,2) NOT NULL DEFAULT 0,
      paid_principal NUMERIC(18,2) NOT NULL DEFAULT 0,
      paid_interest NUMERIC(18,2) NOT NULL DEFAULT 0,
      paid_penalty NUMERIC(18,2) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PARTIAL','PAID','OVERDUE')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (loan_id, installment_no)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS kop_payments (
      id UUID PRIMARY KEY,
      loan_id UUID NOT NULL REFERENCES kop_loans(id) ON DELETE CASCADE,
      paid_date DATE NOT NULL,
      amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
      description TEXT,
      created_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS kop_payment_allocations (
      id UUID PRIMARY KEY,
      payment_id UUID NOT NULL REFERENCES kop_payments(id) ON DELETE CASCADE,
      installment_id UUID NOT NULL REFERENCES kop_installments(id) ON DELETE CASCADE,
      principal_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      interest_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      penalty_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS kop_ledger (
      id UUID PRIMARY KEY,
      loan_id UUID REFERENCES kop_loans(id) ON DELETE SET NULL,
      payment_id UUID REFERENCES kop_payments(id) ON DELETE SET NULL,
      tx_date DATE NOT NULL,
      tx_type VARCHAR(30) NOT NULL CHECK (tx_type IN ('DISBURSEMENT','INSTALLMENT_PAYMENT','PENALTY','ADJUSTMENT')),
      direction VARCHAR(10) NOT NULL CHECK (direction IN ('DEBIT','CREDIT')),
      amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
      description TEXT,
      created_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS kop_member_fees (
      id UUID PRIMARY KEY,
      warga_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      paid_date DATE NOT NULL DEFAULT CURRENT_DATE,
      amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
      created_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export function buildInstallmentPlan({ principal, tenorMonths, interestModel, interestRateMonthly, firstDueMonth }) {
  const rate = Number(interestRateMonthly || 0) / 100;
  const tenor = Number(tenorMonths || 0);
  const p = Number(principal || 0);
  if (!(p > 0) || !(tenor > 0) || !(rate > 0)) throw new Error('parameter angsuran tidak valid');
  if (interestRateMonthly > KOP_MAX_INTEREST_MONTHLY) throw new Error('bunga melebihi batas 2.5%/bulan');

  const plan = [];
  let remaining = p;
  const fixedPrincipal = Math.round((p / tenor) * 100) / 100;
  const [yy, mm] = String(firstDueMonth).split('-').map(Number);

  for (let i = 1; i <= tenor; i += 1) {
    const dt = new Date(yy, (mm - 1) + (i - 1), 1);
    const dueMonth = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    const principalDue = i === tenor ? Math.round(remaining * 100) / 100 : fixedPrincipal;
    const interestBase = interestModel === 'DECLINING' ? remaining : p;
    const interestDue = Math.round((interestBase * rate) * 100) / 100;
    const totalDue = Math.round((principalDue + interestDue) * 100) / 100;
    plan.push({ installment_no: i, due_month: dueMonth, due_date: `${dueMonth}-01`, principal_due: principalDue, interest_due: interestDue, penalty_due: 0, total_due: totalDue });
    remaining = Math.max(0, Math.round((remaining - principalDue) * 100) / 100);
  }
  return plan;
}

export async function createKoperasiLoanDraft({
  wargaId, principalAmount, tenorMonths, interestModel, interestRateMonthly, notes, createdBy
}) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO kop_loans
     (id, warga_id, principal_amount, tenor_months, interest_model, interest_rate_monthly, notes, created_by)
     VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8::uuid)`,
    [id, wargaId, principalAmount, tenorMonths, interestModel, interestRateMonthly, notes || null, createdBy]
  );
  return { id };
}

export async function getKoperasiMemberCandidates() {
  const { rows } = await pool.query(
    `WITH warga_role AS (
       SELECT DISTINCT u.id, u.nama
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE LOWER(TRIM(r.name)) = 'warga'
         AND LOWER(TRIM(COALESCE(u.nama, ''))) <> 'system'
     ),
     fallback_warga AS (
       SELECT u2.id, u2.nama
       FROM users u2
       WHERE LOWER(TRIM(COALESCE(u2.nama, ''))) <> 'system'
         AND NOT EXISTS (
           SELECT 1
           FROM users ux
           JOIN user_roles urx ON urx.user_id = ux.id
           JOIN roles rx ON rx.id = urx.role_id
           WHERE LOWER(TRIM(rx.name)) = 'warga'
         )
     ),
     base_warga AS (
       SELECT * FROM warga_role
       UNION
       SELECT * FROM fallback_warga
     )
     SELECT bw.id AS warga_id, bw.nama, COALESCE(km.is_active, FALSE) AS is_active
       FROM base_warga bw
       LEFT JOIN kop_members km ON km.warga_id = bw.id
      ORDER BY bw.nama ASC`
  );
  return rows;
}

export async function setKoperasiMemberActive({ wargaId, isActive }) {
  await pool.query(
    `INSERT INTO kop_members (warga_id, is_active, joined_at, created_at, updated_at)
     VALUES ($1::uuid, $2, CURRENT_DATE, NOW(), NOW())
     ON CONFLICT (warga_id)
     DO UPDATE SET is_active = EXCLUDED.is_active, updated_at = NOW()`,
    [wargaId, Boolean(isActive)]
  );
  return { warga_id: wargaId, is_active: Boolean(isActive) };
}

export async function registerKoperasiMember({ wargaId, joinFee, createdBy }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO kop_members (warga_id, is_active, joined_at, created_at, updated_at)
       VALUES ($1::uuid, TRUE, CURRENT_DATE, NOW(), NOW())
       ON CONFLICT (warga_id)
       DO UPDATE SET is_active = TRUE, updated_at = NOW()`,
      [wargaId]
    );
    await client.query(
      `INSERT INTO kop_member_fees (id, warga_id, paid_date, amount, created_by)
       VALUES ($1, $2::uuid, CURRENT_DATE, $3, $4::uuid)`,
      [randomUUID(), wargaId, joinFee, createdBy]
    );
    await client.query(
      `INSERT INTO kop_ledger (id, tx_date, tx_type, direction, amount, description, created_by)
       VALUES ($1, CURRENT_DATE, 'ADJUSTMENT', 'CREDIT', $2, $3, $4::uuid)`,
      [randomUUID(), joinFee, 'Biaya pendaftaran anggota koperasi', createdBy]
    );
    await client.query('COMMIT');
    return { warga_id: wargaId, join_fee: Number(joinFee) };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function upsertKoperasiMonthlyFee({ effectiveMonth, amount, updatedBy }) {
  await pool.query(
    `INSERT INTO kop_settings (id, key_name, value_json, updated_by, updated_at)
     VALUES ($1, 'monthly_fee', $2::jsonb, $3::uuid, NOW())
     ON CONFLICT (key_name)
     DO UPDATE SET value_json = EXCLUDED.value_json, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [randomUUID(), JSON.stringify({ effective_month: effectiveMonth, amount }), updatedBy]
  );
}

export async function getKoperasiIuranSummary(month) {
  const [feeRes, memberRes, paidRes] = await Promise.all([
    pool.query(`SELECT value_json FROM kop_settings WHERE key_name='monthly_fee' LIMIT 1`),
    pool.query(`SELECT u.id AS warga_id, u.nama FROM kop_members km JOIN users u ON u.id = km.warga_id WHERE km.is_active = TRUE ORDER BY u.nama`),
    pool.query(
      `SELECT loan_id AS warga_id, COALESCE(SUM(amount),0) AS paid
       FROM kop_payments
       WHERE TO_CHAR(paid_date, 'YYYY-MM') = $1
       GROUP BY loan_id`,
      [month]
    )
  ]);
  const fee = Number(feeRes.rows[0]?.value_json?.amount || 0);
  const paidMap = new Map(paidRes.rows.map((r) => [String(r.warga_id), Number(r.paid || 0)]));
  const rows = memberRes.rows.map((m) => {
    const paid = Number(paidMap.get(String(m.warga_id)) || 0);
    return { warga_id: m.warga_id, nama: m.nama, paid_amount: paid, target_amount: fee, arrears: Math.max(0, fee - paid) };
  });
  return { month, monthly_fee: fee, rows };
}

export async function activateKoperasiLoan({ loanId, firstDueMonth, approvedBy }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const loanQ = await client.query(
      `SELECT *
         FROM kop_loans
        WHERE id = $1::uuid
        FOR UPDATE`,
      [loanId]
    );
    const loan = loanQ.rows[0];
    if (!loan) throw new Error('Pinjaman tidak ditemukan');
    if (loan.status !== 'DRAFT') throw new Error('Pinjaman bukan DRAFT');
    const plan = buildInstallmentPlan({
      principal: Number(loan.principal_amount),
      tenorMonths: Number(loan.tenor_months),
      interestModel: String(loan.interest_model),
      interestRateMonthly: Number(loan.interest_rate_monthly),
      firstDueMonth
    });
    for (const row of plan) {
      await client.query(
        `INSERT INTO kop_installments
         (id, loan_id, installment_no, due_month, due_date, principal_due, interest_due, penalty_due, total_due)
         VALUES ($1, $2::uuid, $3, $4, $5::date, $6, $7, 0, $8)`,
        [randomUUID(), loanId, row.installment_no, row.due_month, row.due_date, row.principal_due, row.interest_due, row.total_due]
      );
    }
    await client.query(
      `UPDATE kop_loans
          SET status = 'ACTIVE',
              disbursed_at = CURRENT_DATE,
              approved_by = $2::uuid,
              approved_at = NOW(),
              updated_at = NOW()
        WHERE id = $1::uuid`,
      [loanId, approvedBy]
    );
    await client.query(
      `INSERT INTO kop_ledger (id, loan_id, tx_date, tx_type, direction, amount, description, created_by)
       VALUES ($1, $2::uuid, CURRENT_DATE, 'DISBURSEMENT', 'DEBIT', $3, $4, $5::uuid)`,
      [randomUUID(), loanId, Number(loan.principal_amount), 'Pencairan pinjaman koperasi', approvedBy]
    );
    await client.query('COMMIT');
    return { loan_id: loanId, installments: plan.length };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function recordKoperasiPayment({ loanId, amount, paidDate, description, createdBy }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const payId = randomUUID();
    await client.query(
      `INSERT INTO kop_payments (id, loan_id, paid_date, amount, description, created_by)
       VALUES ($1, $2::uuid, $3::date, $4, $5, $6::uuid)`,
      [payId, loanId, paidDate, amount, description || null, createdBy]
    );
    let remaining = Number(amount);
    const insQ = await client.query(
      `SELECT *
         FROM kop_installments
        WHERE loan_id = $1::uuid
          AND status IN ('PENDING','PARTIAL','OVERDUE')
        ORDER BY installment_no ASC
        FOR UPDATE`,
      [loanId]
    );
    for (const ins of insQ.rows) {
      if (remaining <= 0) break;
      const dueI = Number(ins.interest_due) - Number(ins.paid_interest);
      const payI = Math.min(remaining, Math.max(0, dueI));
      remaining -= payI;
      const dueP = Number(ins.principal_due) - Number(ins.paid_principal);
      const payP = Math.min(remaining, Math.max(0, dueP));
      remaining -= payP;
      if (payI > 0 || payP > 0) {
        await client.query(
          `INSERT INTO kop_payment_allocations
           (id, payment_id, installment_id, principal_amount, interest_amount, penalty_amount)
           VALUES ($1, $2::uuid, $3::uuid, $4, $5, 0)`,
          [randomUUID(), payId, ins.id, payP, payI]
        );
        await client.query(
          `UPDATE kop_installments
              SET paid_principal = paid_principal + $2,
                  paid_interest = paid_interest + $3,
                  status = CASE
                    WHEN (paid_principal + $2) >= principal_due AND (paid_interest + $3) >= interest_due THEN 'PAID'
                    WHEN (paid_principal + $2) > 0 OR (paid_interest + $3) > 0 THEN 'PARTIAL'
                    ELSE status
                  END,
                  updated_at = NOW()
            WHERE id = $1::uuid`,
          [ins.id, payP, payI]
        );
      }
    }
    await client.query(
      `INSERT INTO kop_ledger (id, loan_id, payment_id, tx_date, tx_type, direction, amount, description, created_by)
       VALUES ($1, $2::uuid, $3::uuid, $4::date, 'INSTALLMENT_PAYMENT', 'CREDIT', $5, $6, $7::uuid)`,
      [randomUUID(), loanId, payId, paidDate, Number(amount), description || 'Pembayaran angsuran', createdBy]
    );
    await client.query('COMMIT');
    return { payment_id: payId, allocated: Number(amount) - Math.max(0, remaining), leftover: Math.max(0, remaining) };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function findKoperasiLoanOwner(loanId) {
  const result = await pool.query(
    `SELECT warga_id::text AS warga_id
     FROM kop_loans
     WHERE id = $1::uuid
     LIMIT 1`,
    [loanId]
  );
  return result.rows[0] || null;
}

export async function getKoperasiSummary() {
  const [agg, loans] = await Promise.all([
    pool.query(
      `SELECT
        COALESCE(SUM(CASE WHEN direction='CREDIT' THEN amount ELSE 0 END),0) -
        COALESCE(SUM(CASE WHEN direction='DEBIT' THEN amount ELSE 0 END),0) AS kas_saldo,
        COALESCE(SUM(CASE WHEN direction='CREDIT' AND tx_type='INSTALLMENT_PAYMENT' THEN amount ELSE 0 END),0) AS total_angsuran_masuk
       FROM kop_ledger`
    ),
    pool.query(
      `SELECT l.id, u.nama, l.principal_amount, l.status,
              COALESCE(SUM(i.principal_due + i.interest_due),0) AS total_tagihan,
              COALESCE(SUM(i.paid_principal + i.paid_interest),0) AS total_bayar
         FROM kop_loans l
         JOIN users u ON u.id = l.warga_id
         LEFT JOIN kop_installments i ON i.loan_id = l.id
        GROUP BY l.id, u.nama, l.principal_amount, l.status
        ORDER BY l.created_at DESC`
    )
  ]);
  return {
    kas_saldo: Number(agg.rows[0]?.kas_saldo || 0),
    total_angsuran_masuk: Number(agg.rows[0]?.total_angsuran_masuk || 0),
    loans: loans.rows.map((r) => ({
      ...r,
      principal_amount: Number(r.principal_amount || 0),
      total_tagihan: Number(r.total_tagihan || 0),
      total_bayar: Number(r.total_bayar || 0),
      sisa_piutang: Math.max(0, Number(r.total_tagihan || 0) - Number(r.total_bayar || 0))
    }))
  };
}
