type StickyTone = 'sky' | 'emerald' | 'rose' | 'amber';

type StickyItem = {
  label: string;
  value: string;
  tone?: StickyTone;
  valueClassName?: string;
};

type Props = {
  items: StickyItem[];
  className?: string;
};

export function operationalStickyValueClass(value: number) {
  return Number(value || 0) < 0 ? 'text-rose-600' : 'text-[var(--accent)]';
}

export default function OperationalStickySummary({ items, className = '' }: Props) {
  return (
    <div className={`ops-sticky-summary ${className}`.trim()}>
      {items.map((item) => (
        <div key={item.label} className={`ops-sticky-item ops-sticky-item-${item.tone || 'sky'}`}>
          {item.label}
          <br />
          <b className={item.valueClassName}>{item.value}</b>
        </div>
      ))}
    </div>
  );
}
