type Props = {
  value: string;
  disabled?: boolean;
  onDraftChange: (value: string) => void;
  onSave: (value: string) => void;
};

export const DEFAULT_MEMBER_START_MONTH = '2026-01';
export const MEMBER_START_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function formatMemberStartMonthLabel(monthKey: string) {
  if (!MEMBER_START_MONTH_PATTERN.test(monthKey)) return monthKey || '-';
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}

export default function MembershipStartMonthInput({ value, disabled = false, onDraftChange, onSave }: Props) {
  return (
    <input
      type="month"
      lang="id-ID"
      className="w-full min-w-[140px] rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
      value={value || DEFAULT_MEMBER_START_MONTH}
      disabled={disabled}
      onChange={(event) => {
        const nextMonth = event.target.value;
        onDraftChange(nextMonth);
        if (MEMBER_START_MONTH_PATTERN.test(nextMonth)) onSave(nextMonth);
      }}
    />
  );
}
