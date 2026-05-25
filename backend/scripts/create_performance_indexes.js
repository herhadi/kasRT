import dotenv from 'dotenv';
dotenv.config();

import { pool } from '../db.js';

const INDEX_QUERIES = [
  // transactions: banyak filter status/type/waktu + source/target wallet
  `CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_status_type_created_at ON transactions (status, type, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_target_status_created_at ON transactions (target_wallet_id, status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_source_status_created_at ON transactions (source_wallet_id, status, created_at DESC)`,

  // iuran wajib
  `CREATE INDEX IF NOT EXISTS idx_iuran_transactions_warga_tanggal ON iuran_transactions (warga_id, tanggal DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_iuran_transactions_ct_tanggal ON iuran_transactions (contribution_type_id, tanggal DESC)`,

  // internet
  `CREATE INDEX IF NOT EXISTS idx_inet_payments_warga_month_key ON inet_payments (warga_id, month_key)`,
  `CREATE INDEX IF NOT EXISTS idx_inet_payments_month_key ON inet_payments (month_key)`,
  `CREATE INDEX IF NOT EXISTS idx_inet_expenses_expense_date ON inet_expenses (expense_date DESC)`,

  // lingkungan
  `CREATE INDEX IF NOT EXISTS idx_lh_payments_warga_month_key ON lh_payments (warga_id, month_key)`,
  `CREATE INDEX IF NOT EXISTS idx_lh_payments_month_key ON lh_payments (month_key)`,
  `CREATE INDEX IF NOT EXISTS idx_lh_expenses_expense_date ON lh_expenses (expense_date DESC)`,

  // koperasi
  `CREATE INDEX IF NOT EXISTS idx_kop_payments_loan_paid_at ON kop_payments (loan_id, paid_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_kop_payments_warga_month_key ON kop_payments (warga_id, month_key)`,

  // jimpitan
  `CREATE INDEX IF NOT EXISTS idx_jimpitan_details_tanggal_petugas ON jimpitan_details (tanggal DESC, petugas_id)`,
  `CREATE INDEX IF NOT EXISTS idx_jimpitan_details_warga_tanggal ON jimpitan_details (warga_id, tanggal DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_jimpitan_batches_status_created_at ON jimpitan_batches (status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_jimpitan_reminder_logs_date_type ON jimpitan_reminder_logs (reminder_date, reminder_type)`
];

async function main() {
  console.log(`Applying ${INDEX_QUERIES.length} performance indexes...`);
  for (const sql of INDEX_QUERIES) {
    await pool.query(sql);
  }
  console.log('✅ Performance indexes applied');
}

main()
  .catch((error) => {
    console.error('❌ Failed applying performance indexes:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

