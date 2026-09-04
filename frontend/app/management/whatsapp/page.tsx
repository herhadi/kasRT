export default function ManagementWhatsappPage() {
  return (
    <main className="min-h-screen bg-[var(--background)]">
      <iframe
        title="WA Gateway — Reminder Jimpitan"
        src="/management?wa_gateway=1"
        className="min-h-screen w-full border-0"
      />
    </main>
  );
}
