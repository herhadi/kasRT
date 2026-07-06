export type UserSession = {
  id: string | number;
  nama: string;
  roles: string[];
  telegram_connected?: boolean;
  no_hp?: string;
  must_change_pin?: boolean;
};

export type LoginResponse = {
  success: boolean;
  token: string;
  user: UserSession;
  message?: string;
};

export type DashboardWargaData = {
  jimpitan_hari_ini: number;
  jimpitan_bulan_ini: number;
  jimpitan_is_member?: boolean;
  iuran_wajib_bulan_ini: number;
  optional_contributions: Array<{
    name: string;
    is_mandatory: boolean;
    amount: number;
  }>;
  total_optional_bulan_ini: number;
  total_kontribusi_bulan_ini: number;
  target_kontribusi_dasar: number;
  target_jimpitan_bulanan: number;
  target_iuran_wajib: number;
  internet_bulan_ini: number;
  internet_target_bulanan: number;
  internet_is_member: boolean;
  internet_membership_request?: MembershipRequestStatus | null;
  internet_status: 'MENUNGGAK' | 'PAS' | 'LEBIH' | 'NON_MEMBER';
  lingkungan_bulan_ini: number;
  koperasi_bulan_ini: number;
  lingkungan_target_bulanan: number;
  lingkungan_is_member: boolean;
  lingkungan_membership_request?: MembershipRequestStatus | null;
  lingkungan_status: 'MENUNGGAK' | 'PAS' | 'LEBIH' | 'NON_MEMBER';
  koperasi_is_member: boolean;
  koperasi_membership_request?: MembershipRequestStatus | null;
  tabungan_is_member?: boolean;
  tabungan_membership_request?: MembershipRequestStatus | null;
  koperasi_has_loan: boolean;
  koperasi_loan_monthly_installment: number;
  koperasi_loan_paid_installments: number;
  koperasi_loan_tenor_months: number;
  koperasi_loan_current_installment_no: number;
  iuran_tunggakan_bulan_ini: number;
  iuran_tunggakan_bulan_count: number;
  internet_tunggakan_total: number;
  internet_tunggakan_bulan_count: number;
  lingkungan_tunggakan_total: number;
  lingkungan_tunggakan_bulan_count: number;
  tabungan_saldo: number;
  total_kas_semua_terkini: number;
  kas_umum: {
    kas_bendahara: number;
    kas_sosial: number;
    kas_tabungan_pembangunan: number;
    kas_lingkungan: number;
    kas_internet: number;
    kas_koperasi: number;
  };
};

export type MembershipRequestStatus = {
  id: string;
  request_type?: 'ACTIVATE' | 'DEACTIVATE';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  note?: string;
  created_at?: string;
  reviewed_at?: string | null;
};

export type JimpitanListItem = {
  id: string | number;
  nama: string;
  target_type?: 'WARGA' | 'DONATUR';
  external_participant_id?: string | null;
  status: 'LUNAS' | 'BELUM';
  namaPetugas: string;
  isLunas: boolean;
  nominalSaran: number;
  nominalTerbayar: number;
  saldo: number;
  detailStatus?: string;
  batchStatus?: string;
  canEditNominal?: boolean;
};

export type JimpitanScheduleData = {
  shift_days: Array<{
    id: number;
    key_name: string;
    label: string;
    sort_order: number;
  }>;
  petugas: Array<{
    id: string | number;
    nama: string;
    jimpitan_shift_hari: number | null;
  }>;
};

export type ManagementRoleItem = {
  id: number;
  name: string;
};

export type ManagementUserItem = {
  id: string | number;
  nama: string;
  no_hp: string;
  roles: string[];
};

export type PendingApprovalItem = {
  kind: 'JIMPITAN_BATCH' | 'TRANSFER' | 'EXPENSE' | 'JIMPITAN_HANDOVER' | 'SOCIAL_RECEIPT' | 'ASSET_RENTAL_PAYMENT';
  id: string | number;
  title: string;
  description: string;
  amount: number;
  created_at: string;
  meta: {
    batch_id?: string | number;
    transaction_id?: string | number;
    petugas_id?: string | number;
    created_by?: string | number;
    created_by_nama?: string | null;
    request_id?: string | number;
    rental_id?: string | number;
    asset_name?: string;
    renter_name?: string;
    periode?: string;
    requested_by?: string | number;
  };
};

export type PendingApprovalSection = {
  key: string;
  label: string;
  items: PendingApprovalItem[];
};

export type ApprovalHistoryItem = {
  kind: 'JIMPITAN_BATCH' | 'TRANSFER' | 'EXPENSE' | 'JIMPITAN_HANDOVER' | 'SOCIAL_RECEIPT' | 'ASSET_RENTAL_PAYMENT';
  id: string | number;
  title: string;
  description: string;
  amount: number;
  created_at: string;
  approved_at: string;
  approved_by: string | number | null;
  approved_by_nama: string | null;
};
