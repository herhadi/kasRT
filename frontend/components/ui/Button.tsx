import { ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger';
};

export default function Button({ variant = 'primary', className = '', ...props }: Props) {
  const classes = {
    primary:
      'bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)] shadow-[0_10px_25px_rgba(30,64,175,0.25)]',
    ghost: 'bg-[var(--surface)] text-[var(--text-primary)] hover:bg-[var(--surface-strong)] border border-[var(--line)]',
    danger: 'bg-[var(--danger)] text-white hover:opacity-90'
  };

  return (
    <button
      {...props}
      className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${classes[variant]} ${className}`}
    />
  );
}
