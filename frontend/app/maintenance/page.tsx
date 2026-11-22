export default function MaintenancePage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--bg-base)] px-4 py-10 text-[var(--text-primary)]">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />

      <section className="relative w-full max-w-lg rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 text-center shadow-xl sm:p-8">
        <img src="/icon.png" alt="Logo KasRT" className="mx-auto h-24 w-24 rounded-3xl shadow-md" />
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.22em] text-[var(--accent)]">KasRT 02/04</p>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Sedang Maintenance</h1>
        <p className="mt-4 text-sm leading-6 text-[var(--text-muted)]">
          KasRT sedang melakukan pemulihan koneksi database agar layanan kembali stabil. Data aplikasi tetap aman.
        </p>

        <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-left text-sm leading-6 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">
          <p className="font-bold">Informasi</p>
          <p className="mt-1">Halaman ini muncul karena aplikasi sedang maintenance, bukan karena server aplikasi mati.</p>
        </div>

        <p className="mt-6 text-xs text-[var(--text-muted)]">Perum Griya Kalisalak Asri · Portal layanan warga</p>
      </section>
    </main>
  );
}
