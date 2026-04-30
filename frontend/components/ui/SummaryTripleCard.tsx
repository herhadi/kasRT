type SummaryItem = {
  label: string;
  value: string;
  emphasize?: boolean;
  className?: string;
};

type Props = {
  title: string;
  items: SummaryItem[];
  sticky?: boolean;
};

export default function SummaryTripleCard({ title, items, sticky = false }: Props) {
  return (
    <div
      className={`mb-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)]/95 px-4 py-3 backdrop-blur ${
        sticky ? 'sticky z-40' : ''
      }`}
      style={sticky ? { top: 'var(--sticky-nav-offset)' } : undefined}
    >
      <p className="text-sm font-semibold text-[var(--text-muted)]">{title}</p>
      <div className={`mt-2 grid grid-cols-1 gap-2 text-sm md:text-base ${items.length >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
        {items.map((item) => (
          <p
            key={item.label}
            className={`surface-muted rounded-xl border border-[var(--line)] px-3 py-2 ${
              item.emphasize ? 'text-right text-[var(--accent)]' : 'text-[var(--text-primary)]'
            } ${item.className || ''}`}
          >
            {item.label}: <b className={item.emphasize ? 'text-[1.14rem] font-extrabold' : ''}>{item.value}</b>
          </p>
        ))}
      </div>
    </div>
  );
}
