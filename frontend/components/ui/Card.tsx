export default function Card({
  title,
  subtitle,
  headerRight,
  children,
  className = ''
}: {
  title: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass-card rounded-3xl p-5 ${className}`}>
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-[var(--font-space-grotesk)] text-lg font-bold text-[var(--text-primary)]">{title}</h3>
          {subtitle ? <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p> : null}
        </div>
        {headerRight && <div className="flex-shrink-0">{headerRight}</div>}
      </header>
      {children}
    </section>
  );
}
