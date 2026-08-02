'use client';

import { useEffect, useMemo, useState } from 'react';
import Navbar from '@/components/layout/Navbar';
import OperationalSubmenuHeader from '@/components/layout/OperationalSubmenuHeader';
import Card from '@/components/ui/Card';
import MemberActionButtons from '@/components/ui/MemberActionButtons';
import FeedbackToast from '@/components/ui/FeedbackToast';
import MembershipStatusFilter from '@/components/membership/MembershipStatusFilter';
import PaginationControls from '@/components/pagination/PaginationControls';
import PeriodPickerCompact from '@/components/contribution/PeriodPickerCompact';
import usePagination from '@/lib/hooks/usePagination';
import { apiFetch } from '@/lib/api';

type AttendanceMember = {
  warga_id: string;
  nama: string;
  is_active: boolean;
};

export default function PresensiSettingPage() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [members, setMembers] = useState<AttendanceMember[]>([]);
  const [filter, setFilter] = useState<'aktif' | 'nonaktif'>('aktif');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    const result = await apiFetch<{ success: boolean; data: Array<AttendanceMember & { status?: string }> }>(
      `/management/meeting-attendance?month=${encodeURIComponent(month)}`
    );
    setMembers((result.data || []).map(({ warga_id, nama, is_active }) => ({ warga_id, nama, is_active })));
  }

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'Gagal memuat pengaturan presensi'));
  }, [month]);

  async function toggleMember(member: AttendanceMember) {
    try {
      setBusyId(member.warga_id);
      setError('');
      await apiFetch('/management/meeting-attendance/member-status', {
        method: 'POST',
        body: JSON.stringify({ warga_id: member.warga_id, is_active: !member.is_active })
      });
      setMembers((previous) => previous.map((item) => item.warga_id === member.warga_id ? { ...item, is_active: !item.is_active } : item));
      setMessage(`${member.nama} ${member.is_active ? 'dikecualikan dari' : 'dimasukkan ke'} wajib hadir presensi.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengubah pengecualian presensi');
    } finally {
      setBusyId(null);
    }
  }

  const filteredMembers = useMemo(
    () => members.filter((member) => filter === 'aktif' ? member.is_active : !member.is_active),
    [members, filter]
  );
  const pager = usePagination(filteredMembers, 10);

  return (
    <main className="min-h-screen pb-10">
      <FeedbackToast error={error} message={message} />
      <Navbar />
      <div className="mx-auto mt-6 w-full max-w-6xl space-y-5 px-4 md:px-6">
        <OperationalSubmenuHeader backHref="/operasional/sekretaris/presensi" title="Kembali ke Presensi" />
        <Card
          title="Pengaturan Presensi Rapat"
          subtitle="Daftar warga mengikuti eligible user global. Atur pengecualian khusus untuk presensi."
          headerRight={<PeriodPickerCompact label="Periode" value={month} onChange={setMonth} />}
        >
          <MembershipStatusFilter
            value={filter}
            activeCount={members.filter((member) => member.is_active).length}
            inactiveCount={members.filter((member) => !member.is_active).length}
            onChange={setFilter}
            activeLabel="Wajib Hadir"
            inactiveLabel="Dikecualikan"
          />
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
              <thead>
                <tr className="bg-[var(--surface-strong)]">
                  <th className="px-3 py-2 text-left text-xs">Warga</th>
                  <th className="px-3 py-2 text-left text-xs">Status Presensi</th>
                  <th className="px-3 py-2 text-right text-xs">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {pager.pagedItems.map((member) => (
                  <tr key={member.warga_id} className="bg-[var(--surface)]">
                    <td className="border-t border-[var(--line)] px-3 py-2 text-sm">{member.nama}</td>
                    <td className={`border-t border-[var(--line)] px-3 py-2 text-sm font-semibold ${member.is_active ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {member.is_active ? 'Wajib Hadir' : 'Dikecualikan'}
                    </td>
                    <td className="border-t border-[var(--line)] px-3 py-2 text-right">
                      <MemberActionButtons
                        isActive={member.is_active}
                        disabled={busyId === member.warga_id}
                        onToggle={() => void toggleMember(member)}
                        activeActionLabel="Kecualikan"
                        inactiveActionLabel="Masukkan Wajib Hadir"
                      />
                    </td>
                  </tr>
                ))}
                {!filteredMembers.length ? <tr><td colSpan={3} className="px-3 py-3 text-sm text-[var(--text-muted)]">Tidak ada warga pada filter ini.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <PaginationControls page={pager.page} totalPages={pager.totalPages} onPrev={pager.prev} onNext={pager.next} />
        </Card>
      </div>
    </main>
  );
}
