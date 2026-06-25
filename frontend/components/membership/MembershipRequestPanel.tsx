import Button from '@/components/ui/Button';

export type MembershipRequestItem = {
  id: string;
  warga_id: string;
  nama: string;
  no_hp?: string | null;
  created_at?: string;
  note?: string | null;
};

export default function MembershipRequestPanel({
  title = 'Request Keanggotaan',
  requests,
  busy,
  onApprove,
  onReject
}: {
  title?: string;
  requests: MembershipRequestItem[];
  busy?: boolean;
  onApprove: (requestId: string) => void;
  onReject: (requestId: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold text-amber-950">{title}</p>
          <p className="text-xs text-amber-800">Warga yang meminta diaktifkan sebagai anggota.</p>
        </div>
        <span className="inline-flex w-fit rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-amber-900">
          {requests.length} pending
        </span>
      </div>
      {!requests.length ? (
        <p className="rounded-xl border border-amber-100 bg-white/70 px-3 py-2 text-sm text-amber-800">Tidak ada request pending.</p>
      ) : (
        <div className="space-y-2">
          {requests.map((request) => (
            <div key={request.id} className="rounded-xl border border-amber-100 bg-white/80 p-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-bold text-[var(--text-primary)]">{request.nama}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{request.no_hp || '-'}{request.note ? ` • ${request.note}` : ''}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <Button className="w-full sm:w-auto" onClick={() => onApprove(request.id)} disabled={busy}>Approve</Button>
                  <Button variant="ghost" className="w-full sm:w-auto" onClick={() => onReject(request.id)} disabled={busy}>Tolak</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
