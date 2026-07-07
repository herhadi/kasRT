'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import FeedbackToast from '@/components/ui/FeedbackToast';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { isValidPin, normalizePinInput } from '@/lib/helpers';
import usePagination from '@/lib/hooks/usePagination';
import { useAuth } from '@/lib/useAuth';
import PaginationControls from '@/components/pagination/PaginationControls';
import { ManagementRoleItem, ManagementUserItem } from '@/types';

type WargaOption = { id: string; nama: string; no_hp?: string };

function formatLastLogin(value?: string | null) {
  if (!value) return 'Belum pernah login';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

export default function UserManagementPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [users, setUsers] = useState<ManagementUserItem[]>([]);
  const [wargaOptions, setWargaOptions] = useState<WargaOption[]>([]);
  const [organizationRoles, setOrganizationRoles] = useState<ManagementRoleItem[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [newNama, setNewNama] = useState('');
  const [newNoHp, setNewNoHp] = useState('');
  const [newPin, setNewPin] = useState('');
  const [editNama, setEditNama] = useState('');
  const [editNoHp, setEditNoHp] = useState('');
  const [savingUser, setSavingUser] = useState(false);
  const [savingEditUser, setSavingEditUser] = useState(false);
  const [resettingPin, setResettingPin] = useState(false);
  const [savingRoles, setSavingRoles] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const canManage = hasAnyRole(user, ['Ketua', 'Plt Ketua', 'Sekretaris', 'root']);
  const isRoot = hasAnyRole(user, ['root']);
  const canManageLeadership = hasAnyRole(user, ['Ketua', 'Plt Ketua', 'root']);

  const loadData = useCallback(async () => {
    const result = await apiFetch<{
      success: boolean;
      data: { users: ManagementUserItem[]; organization_roles: ManagementRoleItem[] };
    }>('/management/users');
    const rows = result.data?.users || [];
    const roles = result.data?.organization_roles || [];
    setUsers(rows);
    setOrganizationRoles(roles);
  }, []);

  const loadWargaOptions = useCallback(async () => {
    const result = await apiFetch<{ success: boolean; data: WargaOption[] }>('/auth/warga-options');
    const rows = result.data || [];
    setWargaOptions(rows);
    setSelectedUserId((prev) => {
      if (prev && rows.some((row) => String(row.id) === String(prev))) return prev;
      return rows[0]?.id ? String(rows[0].id) : '';
    });
  }, []);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (loading) return;
    if (!canManage) return;
    void Promise.all([loadData(), loadWargaOptions()]).catch((e) =>
      setError(e instanceof Error ? e.message : 'Gagal memuat data manajemen')
    );
  }, [loading, canManage, loadData, loadWargaOptions]);

  useEffect(() => {
    if (!selectedUserId) {
      setSelectedRoleId(null);
      return;
    }
    const selectedUser = users.find((row) => String(row.id) === String(selectedUserId));
    if (!selectedUser) {
      setSelectedRoleId(null);
      return;
    }
    const owned = new Set((selectedUser.roles || []).map((r) => String(r).toLowerCase()));
    const mapped = organizationRoles.find((r) => owned.has(String(r.name).toLowerCase()));
    setSelectedRoleId(mapped ? Number(mapped.id) : null);
  }, [selectedUserId, users, organizationRoles]);

  useEffect(() => {
    if (!selectedUserId) {
      setEditNama('');
      setEditNoHp('');
      return;
    }
    const selectedUser = users.find((u) => String(u.id) === String(selectedUserId));
    setEditNama(String(selectedUser?.nama || ''));
    setEditNoHp(String(selectedUser?.no_hp || ''));
  }, [selectedUserId, users]);

  async function handleAddWarga() {
    setError('');
    setMessage('');
    const nama = newNama.trim();
    const no_hp = newNoHp.trim();
    const pin = newPin.trim();
    if (!nama || !no_hp || !pin) {
      setError('Nama, nomor HP, dan PIN wajib diisi.');
      return;
    }
    if (!isValidPin(pin)) {
      setError('PIN harus 4 sampai 6 digit angka.');
      return;
    }

    try {
      setSavingUser(true);
      await apiFetch('/management/users', {
        method: 'POST',
        body: JSON.stringify({ nama, no_hp, pin })
      });
      setNewNama('');
      setNewNoHp('');
      setNewPin('');
      setMessage('Warga baru berhasil ditambahkan dengan role default Warga (id 11).');
      await Promise.all([loadData(), loadWargaOptions()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menambah warga');
    } finally {
      setSavingUser(false);
    }
  }

  async function saveAdminRoles() {
    setError('');
    setMessage('');
    if (!selectedUserId) {
      setError('Pilih warga terlebih dahulu.');
      return;
    }
    const role_ids = selectedRoleId ? [selectedRoleId] : [];
    try {
      setSavingRoles(true);
      await apiFetch(`/management/users/${encodeURIComponent(selectedUserId)}/admin-roles`, {
        method: 'POST',
        body: JSON.stringify({ role_ids })
      });
      setMessage('Penunjukan admin berhasil disimpan.');
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan role admin');
    } finally {
      setSavingRoles(false);
    }
  }

  async function saveWargaEdit() {
    setError('');
    setMessage('');
    if (!selectedUserId) {
      setError('Pilih warga terlebih dahulu.');
      return;
    }
    const nama = editNama.trim();
    const no_hp = editNoHp.trim();
    if (!nama || !no_hp) {
      setError('Nama dan nomor HP wajib diisi.');
      return;
    }
    try {
      setSavingEditUser(true);
      const res = await apiFetch<{ success: boolean; message?: string }>(`/management/users/${encodeURIComponent(selectedUserId)}/edit`, {
        method: 'POST',
        body: JSON.stringify({ nama, no_hp })
      });
      setMessage(res.message || 'Data warga berhasil diperbarui.');
      await Promise.all([loadData(), loadWargaOptions()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengubah data warga');
    } finally {
      setSavingEditUser(false);
    }
  }

  async function resetPinDefault() {
    setError('');
    setMessage('');
    if (!selectedUserId) {
      setError('Pilih warga terlebih dahulu.');
      return;
    }
    try {
      setResettingPin(true);
      const res = await apiFetch<{ success: boolean; message?: string }>(`/management/users/${encodeURIComponent(selectedUserId)}/edit`, {
        method: 'POST',
        body: JSON.stringify({ nama: editNama.trim(), no_hp: editNoHp.trim(), reset_pin: true })
      });
      setMessage(res.message || 'PIN berhasil di-reset ke default.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal reset PIN');
    } finally {
      setResettingPin(false);
    }
  }

  const loginRows = [...users].sort((a, b) => {
    const at = a.last_login_at ? new Date(a.last_login_at).getTime() : 0;
    const bt = b.last_login_at ? new Date(b.last_login_at).getTime() : 0;
    return bt - at || String(a.nama).localeCompare(String(b.nama), 'id');
  });
  const loginPager = usePagination(loginRows, 10);

  if (loading || !user) return <main className="min-h-screen" />;

  const organizationTableRows = organizationRoles
    .filter((role) => String(role.name).trim().toLowerCase() !== 'plt ketua')
    .map((role) => {
    const members = users.filter((row) =>
      (row.roles || []).some((ownedRole) => String(ownedRole).toLowerCase() === String(role.name).toLowerCase())
    );
    return { role, members };
  });

  const leadershipRoleNames = new Set(['ketua', 'sekretaris']);
  const roleOptions = organizationRoles.filter((role) => {
    const isLeadership = leadershipRoleNames.has(String(role.name).toLowerCase());
    return canManageLeadership || !isLeadership;
  });
  if (!canManage) {
    return (
      <main className="min-h-screen pb-10">
        <Navbar />
        <div className="mx-auto mt-6 w-full max-w-4xl px-4 md:px-6">
          <Card title="Tidak Ada Akses" subtitle="Khusus Ketua, Plt Ketua, Sekretaris, atau root">
            <p className="text-sm text-[var(--text-muted)]">Anda tidak memiliki akses ke menu manajemen warga/admin.</p>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-10">
      <FeedbackToast error={error} message={message} />
      <Navbar />
      <div className="mx-auto mt-6 w-full max-w-6xl space-y-5 px-4 md:px-6">
        <Card title="Edit Warga" subtitle="Perbarui data warga, dan reset PIN ke default bila diperlukan">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-2 text-sm font-semibold">
              <span>Nama Warga</span>
              <select
                className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-sm text-[var(--text-primary)]"
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
              >
                {wargaOptions.map((row) => (
                  <option key={String(row.id)} value={String(row.id)}>
                    {row.nama} ({row.no_hp || '-'})
                  </option>
                ))}
              </select>
            </label>
            <Input label="Nomor HP" value={editNoHp} onChange={(e) => setEditNoHp(e.target.value)} />
            <div className="flex items-end">
              <Button className="w-full" onClick={saveWargaEdit} disabled={savingEditUser || !selectedUserId}>
                {savingEditUser ? 'Menyimpan...' : 'Simpan Perubahan'}
              </Button>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button variant="ghost" className="w-full md:w-auto" onClick={resetPinDefault} disabled={resettingPin || !selectedUserId}>
              {resettingPin ? 'Reset PIN...' : 'Reset PIN ke Default'}
            </Button>
          </div>
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            Reset PIN akan mengatur PIN ke default `1234` dan user wajib ganti PIN saat login berikutnya.
          </p>
        </Card>

        {isRoot ? (
          <Card title="Login Terakhir" subtitle="Pantauan login warga dan pengurus, hanya root">
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
                <thead>
                  <tr className="bg-[var(--surface-strong)]">
                    <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Nama</th>
                    <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">No HP</th>
                    <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Role</th>
                    <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Last Login</th>
                  </tr>
                </thead>
                <tbody>
                  {loginPager.pagedItems.map((row) => (
                    <tr key={String(row.id)} className="bg-[var(--surface)]">
                      <td className="border-b border-[var(--line)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)]">{row.nama}</td>
                      <td className="border-b border-[var(--line)] px-4 py-3 text-sm text-[var(--text-primary)]">{row.no_hp || '-'}</td>
                      <td className="border-b border-[var(--line)] px-4 py-3 text-sm text-[var(--text-primary)]">{(row.roles || []).join(', ') || '-'}</td>
                      <td className="border-b border-[var(--line)] px-4 py-3 text-sm text-[var(--text-primary)]">{formatLastLogin(row.last_login_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationControls page={loginPager.page} totalPages={loginPager.totalPages} onPrev={loginPager.prev} onNext={loginPager.next} />
          </Card>
        ) : null}

        <Card title="Manajemen Warga" subtitle="Tambah warga baru dan tunjuk role admin sesuai kebutuhan">
          <div className="grid gap-3 md:grid-cols-4">
            <Input label="Nama Warga" value={newNama} onChange={(e) => setNewNama(e.target.value)} placeholder="Nama lengkap" />
            <Input label="Nomor HP" value={newNoHp} onChange={(e) => setNewNoHp(e.target.value)} placeholder="08xxxxxxxxxx" />
            <Input
              label="PIN"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={newPin}
              onChange={(e) => setNewPin(normalizePinInput(e.target.value))}
            />
            <div className="flex items-end">
              <Button className="w-full" onClick={handleAddWarga} disabled={savingUser}>
                {savingUser ? 'Menyimpan...' : 'Tambah Warga'}
              </Button>
            </div>
          </div>
          <p className="mt-3 text-xs text-[var(--text-muted)]">Default role user baru otomatis `Warga` (id 11) pada tabel `user_roles`.</p>
        </Card>

        <Card title="Penunjukan Struktur" subtitle="Pilih warga dan tetapkan jabatan organisasi RT">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-2 text-sm font-semibold md:col-span-2">
              <span>Pilih Warga</span>
              <select
                className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3"
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
              >
                {wargaOptions.map((row) => (
                  <option key={String(row.id)} value={String(row.id)}>
                    {row.nama} ({row.no_hp || '-'})
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm font-semibold">
              <span>Pilih Jabatan</span>
              <select
                className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3"
                value={selectedRoleId ?? ''}
                onChange={(event) => {
                  const raw = event.target.value;
                  setSelectedRoleId(raw === '' ? null : Number(raw));
                }}
              >
                <option value="">Tanpa Jabatan Tambahan</option>
                {roleOptions.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="md:col-span-3 flex justify-end">
              <Button className="w-full md:w-auto" onClick={saveAdminRoles} disabled={savingRoles || !selectedUserId}>
                {savingRoles ? 'Menyimpan...' : 'Simpan Jabatan'}
              </Button>
            </div>
          </div>
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            Role `Warga` tetap melekat. Jabatan tambahan di sini bersifat organisasi.
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Khusus jabatan `Ketua` dan `Sekretaris`, hanya `Ketua`, `Plt Ketua`, atau `root` yang boleh menetapkan atau mengubah.
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
              <thead>
                <tr className="bg-[var(--surface-strong)]">
                  <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Jabatan</th>
                  <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Nama</th>
                  <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">No HP</th>
                </tr>
              </thead>
              <tbody>
                {organizationTableRows.map(({ role, members }) => (
                  <tr key={role.id} className="bg-[var(--surface)]">
                    <td className="border-b border-[var(--line)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)]">
                      {role.name}
                    </td>
                    <td className="border-b border-[var(--line)] px-4 py-3 text-sm text-[var(--text-primary)]">
                      {members.length > 0 ? members.map((m) => m.nama).join(', ') : '-'}
                    </td>
                    <td className="border-b border-[var(--line)] px-4 py-3 text-sm text-[var(--text-primary)]">
                      {members.length > 0 ? members.map((m) => m.no_hp || '-').join(', ') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>        
      </div>
    </main>
  );
}
