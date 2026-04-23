export default function Card({
  title,
  subtitle,
  children,
  className = ''
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass-card rounded-3xl p-5 ${className}`}>
      <header className="mb-4">
        <h3 className="font-[var(--font-space-grotesk)] text-lg font-bold text-[var(--text-primary)]">{title}</h3>
        {subtitle ? <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p> : null}
      </header>
      {children}
    </section>
  );
}
