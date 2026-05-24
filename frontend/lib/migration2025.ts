import { parseRupiahInput } from '@/lib/helpers';

export function MIGRATION_MONTH_KEYS_FOR_YEAR(year: number) {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
}

export function MIGRATION_MONTH_LABELS_FOR_YEAR(year: number): Record<string, string> {
  return MIGRATION_MONTH_KEYS_FOR_YEAR(year).reduce((acc, monthKey, i) => {
    const labels = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    acc[monthKey] = labels[i];
    return acc;
  }, {} as Record<string, string>);
}

export const MIGRATION_MONTH_KEYS_2025 = MIGRATION_MONTH_KEYS_FOR_YEAR(2025);

export const MIGRATION_MONTH_LABELS: Record<string, string> = MIGRATION_MONTH_LABELS_FOR_YEAR(2025);

export type MigrationFormModule =
  | 'iuran-2025'
  | 'internet-2025'
  | 'lingkungan-2025'
  | 'jimpitan-2025'
  | 'tabungan-2025'
  | 'sosial-2025'
  | 'koperasi-iuran-2025';

export const FORM_MIGRATION_MODULES: MigrationFormModule[] = [
  'iuran-2025',
  'internet-2025',
  'lingkungan-2025',
  'jimpitan-2025',
  'tabungan-2025',
  'sosial-2025',
  'koperasi-iuran-2025'
];

export type FormAmountMigrationModule = Exclude<MigrationFormModule, 'iuran-2025' | 'sosial-2025'>;

export function isFormMigrationModule(key: string): key is MigrationFormModule {
  return (FORM_MIGRATION_MODULES as readonly string[]).includes(key);
}

export function isFormAmountMigrationModule(key: string): key is FormAmountMigrationModule {
  return isFormMigrationModule(key) && key !== 'iuran-2025' && key !== 'sosial-2025';
}

export type MigrationMonthEntry = {
  active: boolean;
  amount: string;
};

export type MigrationMonthState = Record<string, MigrationMonthEntry>;

export type MigrationIuranMonthEntry = {
  active: boolean;
  target: string;
  paid: string;
};

export type MigrationIuranMonthState = Record<string, MigrationIuranMonthEntry>;

export type MigrationSosialMonthEntry = {
  active: boolean;
  pemasukan: string;
  pengeluaran: string;
};

export type MigrationSosialMonthState = Record<string, MigrationSosialMonthEntry>;

export function emptyMigrationMonthState(year = 2025): MigrationMonthState {
  return Object.fromEntries(
    MIGRATION_MONTH_KEYS_FOR_YEAR(year).map((month) => [month, { active: false, amount: '' }])
  ) as MigrationMonthState;
}

export function emptyMigrationIuranMonthState(year = 2025): MigrationIuranMonthState {
  return Object.fromEntries(
    MIGRATION_MONTH_KEYS_FOR_YEAR(year).map((month) => [month, { active: false, target: '', paid: '' }])
  ) as MigrationIuranMonthState;
}

export function emptyMigrationSosialMonthState(year = 2025): MigrationSosialMonthState {
  return Object.fromEntries(
    MIGRATION_MONTH_KEYS_FOR_YEAR(year).map((month) => [month, { active: false, pemasukan: '', pengeluaran: '' }])
  ) as MigrationSosialMonthState;
}

export function tariffMapFromApi(months: Array<{ month: string; amount: number }>) {
  const map: Record<string, number> = {};
  for (const row of months) {
    map[String(row.month)] = Number(row.amount || 0);
  }
  return map;
}

export function migrationMonthStateFromApi(
  months: Array<{ month: string; amount: number }>,
  year = 2025
): MigrationMonthState {
  const state = emptyMigrationMonthState(year);
  const allowed = new Set(MIGRATION_MONTH_KEYS_FOR_YEAR(year));
  for (const row of months) {
    const month = String(row.month || '');
    if (!allowed.has(month)) continue;
    const amount = Number(row.amount || 0);
    state[month] = {
      active: amount !== 0,
      amount:
        amount !== 0
          ? amount < 0
            ? `-${Math.abs(amount)}`
            : String(amount)
          : ''
    };
  }
  return state;
}

export function migrationIuranMonthStateFromApi(
  months: Array<{ month: string; target_amount: number; paid_amount: number; has_saved?: boolean }>,
  year = 2025
): MigrationIuranMonthState {
  const state = emptyMigrationIuranMonthState(year);
  const allowed = new Set(MIGRATION_MONTH_KEYS_FOR_YEAR(year));
  for (const row of months) {
    const month = String(row.month || '');
    if (!allowed.has(month)) continue;
    const paid = Number(row.paid_amount || 0);
    const target = Number(row.target_amount || 0);
    const active = Boolean(row.has_saved) || paid > 0;
    state[month] = {
      active,
      target: active || target > 0 ? String(target) : '',
      paid: paid > 0 ? String(paid) : ''
    };
  }
  return state;
}

export function migrationSosialMonthStateFromApi(
  months: Array<{ month: string; pemasukan: number; pengeluaran: number }>,
  year = 2025
): MigrationSosialMonthState {
  const state = emptyMigrationSosialMonthState(year);
  const allowed = new Set(MIGRATION_MONTH_KEYS_FOR_YEAR(year));
  for (const row of months) {
    const month = String(row.month || '');
    if (!allowed.has(month)) continue;
    const pemasukan = Number(row.pemasukan || 0);
    const pengeluaran = Number(row.pengeluaran || 0);
    const active = pemasukan !== 0 || pengeluaran !== 0;
    state[month] = {
      active,
      pemasukan: pemasukan > 0 ? String(pemasukan) : '',
      pengeluaran: pengeluaran > 0 ? String(pengeluaran) : ''
    };
  }
  return state;
}

export function parseMigrationAmountInput(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  if (raw.startsWith('-')) {
    const digits = raw.slice(1).replace(/\D+/g, '');
    return digits ? -Number(digits) : 0;
  }
  return parseRupiahInput(raw);
}

export function buildMigrationAmountRows(wargaId: string, state: MigrationMonthState, year = 2025) {
  return MIGRATION_MONTH_KEYS_FOR_YEAR(year).map((month) => {
    const entry = state[month];
    const amount = entry?.active ? parseMigrationAmountInput(entry.amount) : 0;
    return { warga_id: wargaId, month, amount };
  });
}

export function buildMigrationIuranRows(wargaId: string, state: MigrationIuranMonthState, year = 2025) {
  return MIGRATION_MONTH_KEYS_FOR_YEAR(year).map((month) => {
    const entry = state[month];
    if (!entry?.active) {
      return { warga_id: wargaId, month, target_amount: 0, paid_amount: 0 };
    }
    return {
      warga_id: wargaId,
      month,
      target_amount: parseMigrationAmountInput(entry.target),
      paid_amount: parseMigrationAmountInput(entry.paid)
    };
  });
}

export function buildMigrationSosialRows(state: MigrationSosialMonthState, year = 2025) {
  return MIGRATION_MONTH_KEYS_FOR_YEAR(year).map((month) => {
    const entry = state[month];
    if (!entry?.active) {
      return { month, pemasukan: 0, pengeluaran: 0 };
    }
    return {
      month,
      pemasukan: parseMigrationAmountInput(entry.pemasukan),
      pengeluaran: parseMigrationAmountInput(entry.pengeluaran)
    };
  });
}

export const MODULE_HAS_TARIFF_DEFAULTS: Partial<Record<FormAmountMigrationModule, boolean>> = {
  'internet-2025': true,
  'lingkungan-2025': true,
  'jimpitan-2025': true
};

export const MODULE_MEMBER_ONLY: Partial<Record<MigrationFormModule, boolean>> = {
  'internet-2025': true,
  'lingkungan-2025': true
};

export type MemberOnlyMigrationModule = 'internet-2025' | 'lingkungan-2025';

export function isMemberOnlyMigrationModule(key: string): key is MemberOnlyMigrationModule {
  return key === 'internet-2025' || key === 'lingkungan-2025';
}

export function migrationWargaOptionsPath(moduleKey: string, year = 2025) {
  const base = String(moduleKey || '').split('-')[0];
  if (base === 'internet') return `/migration/internet-${year}/members`;
  if (base === 'lingkungan') return `/migration/lingkungan-${year}/members`;
  return '/auth/warga-options';
}
