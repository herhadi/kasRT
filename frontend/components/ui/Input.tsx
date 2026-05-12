import { InputHTMLAttributes } from 'react';
import { normalizeDateInputValue } from '@/lib/helpers';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
};

export default function Input({ label, className = '', ...props }: Props) {
  const typeValue = String(props.type || 'text').toLowerCase();
  const isDateLike = typeValue === 'date' || typeValue === 'month' || typeValue === 'time';
  const normalizedProps = isDateLike
    ? {
        ...props,
        value: props.value === undefined ? undefined : normalizeDateInputValue(props.value, typeValue),
        defaultValue: props.defaultValue === undefined
          ? undefined
          : normalizeDateInputValue(props.defaultValue, typeValue)
      }
    : props;

  return (
    <label className="block space-y-2">
      <span className="text-sm font-semibold text-[var(--text-primary)]">{label}</span>
      <input
        {...normalizedProps}
        lang={isDateLike ? 'id-ID' : props.lang}
        className={`w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)] ${className}`}
      />
    </label>
  );
}
