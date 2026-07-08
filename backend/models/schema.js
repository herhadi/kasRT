export const dbSchema = {
  users: ['id', 'nama', 'no_hp', 'pin', 'jimpitan_saldo', 'telegram_chat_id', 'jimpitan_shift_hari', 'jimpitan_alias'],
  roles: ['id', 'name'],
  user_roles: ['user_id', 'role_id'],
  wallets: ['id', 'name'],
  transactions: [
    'id',
    'type',
    'source_wallet_id',
    'target_wallet_id',
    'amount',
    'status',
    'description',
    'created_by',
    'approved_by',
    'approved_at',
    'created_at'
  ],
  jimpitan_details: ['id', 'warga_id', 'nominal', 'tanggal', 'petugas_id', 'status', 'created_at'],
  jimpitan_batches: ['id', 'petugas_id', 'total_amount', 'status', 'approved_by', 'approved_at', 'created_at'],
  jimpitan_batch_items: ['id', 'batch_id', 'jimpitan_detail_id'],
  jimpitan_topups: ['id', 'warga_id', 'nominal', 'admin_id', 'note', 'created_at'],
  jimpitan_shift_days: ['id', 'key_name', 'label', 'sort_order'],
  contribution_types: ['id', 'name', 'is_mandatory'],
  iuran_transactions: ['id', 'warga_id', 'contribution_type_id', 'amount', 'tanggal', 'created_at'],
  telegram_link_tokens: ['id', 'user_id', 'code', 'expires_at', 'used_at', 'created_at']
};
