export type UserSession = {
  id: number;
  nama: string;
  roles: string[];
  telegram_connected?: boolean;
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
  internet_status: 'MENUNGGAK' | 'PAS' | 'LEBIH' | 'NON_MEMBER';
  lingkungan_bulan_ini: number;
  lingkungan_target_bulanan: number;
  lingkungan_is_member: boolean;
  lingkungan_status: 'MENUNGGAK' | 'PAS' | 'LEBIH' | 'NON_MEMBER';
};

export type JimpitanListItem = {
  id: number;
  nama: string;
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
  petugas: Array<{
    id: number;
    nama: string;
    jimpitan_shift_hari: number | null;
  }>;
};

export type PendingApprovalItem = {
  kind: 'JIMPITAN_BATCH' | 'TRANSFER' | 'EXPENSE';
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
  };
};

export type PendingApprovalSection = {
  key: string;
  label: string;
  items: PendingApprovalItem[];
};

export type ApprovalHistoryItem = {
  kind: 'JIMPITAN_BATCH' | 'TRANSFER' | 'EXPENSE';
  id: string | number;
  title: string;
  description: string;
  amount: number;
  created_at: string;
  approved_at: string;
  approved_by: string | number | null;
  approved_by_nama: string | null;
};
