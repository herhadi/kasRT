type StatusKey = 'aktif' | 'nonaktif';

type Props = {
  value: StatusKey;
  activeCount: number;
  inactiveCount: number;
  onChange: (value: StatusKey) => void;
  className?: string;
};

export default function MembershipStatusFilter({ value, activeCount, inactiveCount, onChange, className = '' }: Props) {
  const items: Array<{ key: StatusKey; label: string; count: number }> = [
    { key: 'aktif', label: 'Aktif', count: activeCount },
    { key: 'nonaktif', label: 'Nonaktif', count: inactiveCount }
  ];

  return (
    <div className={`mb-3 grid grid-cols-2 gap-2 sm:max-w-xs ${className}`.trim()}>
      {items.map((item) => {
        const selected = value === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
              selected
                ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                : 'border-[var(--line)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--accent)]/50'
            }`}
          >
            {item.label} ({item.count})
          </button>
        );
      })}
    </div>
  );
}
