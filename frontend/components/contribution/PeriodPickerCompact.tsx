'use client';

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

export default function PeriodPickerCompact({ label, value, onChange }: Props) {
  return (
    <div className="w-full max-w-[220px]">
      <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-sky-700">
        {label}
      </label>
      <input
        type="month"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="period-picker-compact mt-1"
      />
    </div>
  );
}
