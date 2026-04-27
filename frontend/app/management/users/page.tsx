'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { useAuth } from '@/lib/useAuth';
import { ManagementRoleItem, ManagementUserItem } from '@/types';

export default function UserManagementPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [users, setUsers] = useState<ManagementUserItem[]>([]);
  const [adminRoles, setAdminRoles] = useState<ManagementRoleItem[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, number[]>>({});
  const [newNama, setNewNama] = useState('');
  const [newNoHp, setNewNoHp] = useState('');
  const [newPin, setNewPin] = useState('');
  const [savingUser, setSavingUser] = useState(false);
  const [savingRoleUserId, setSavingRoleUserId] = useState<string>('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const canManage = hasAnyRole(user, ['Ketua', 'Sekretaris', 'root']);

  const loadData = useCallback(async () => {
    const result = await apiFetch<{
      success: boolean;
      data: { users: ManagementUserItem[]; admin_roles: ManagementRoleItem[] };
    }>('/management/users');
    const rows = result.data?.users || [];
    const roles = result.data?.admin_roles || [];
    setUsers(rows);
    setAdminRoles(roles);
    const nextSelected: Record<string, number[]> = {};
    rows.forEach((row) => {
      const owned = new Set((row.roles || []).map((r) => String(r).toLowerCase()));
      nextSelected[String(row.id)] = roles.filter((r) => owned.has(String(r.name).toLowerCase())).map((r) => Number(r.id));
    });
    setSelectedRoles(nextSelected);
  }, []);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (loading) return;
    if (!canManage) return;
    void loadData().catch((e) => setError(e instanceof Error ? e.message : 'Gagal memuat data manajemen'));
  }, [loading, canManage, loadData]);

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
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menambah warga');
    } finally {
      setSavingUser(false);
    }
  }

  function toggleRole(userId: string, roleId: number) {
    setSelectedRoles((prev) => {
      const current = prev[userId] || [];
      const exists = current.includes(roleId);
      const next = exists ? current.filter((id) => id !== roleId) : [...current, roleId];
      return { ...prev, [userId]: next.sort((a, b) => a - b) };
    });
  }

  async function saveAdminRoles(userId: string) {
    setError('');
    setMessage('');
    const role_ids = selectedRoles[userId] || [];
    try {
      setSavingRoleUserId(userId);
      await apiFetch(`/management/users/${encodeURIComponent(userId)}/admin-roles`, {
        method: 'POST',
        body: JSON.stringify({ role_ids })
      });
      setMessage('Penunjukan admin berhasil disimpan.');
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan role admin');
    } finally {
      setSavingRoleUserId('');
    }
  }

  if (loading || !user) return <main className="min-h-screen" />;

  if (!canManage) {
    return (
      <main className="min-h-screen pb-10">
        <Navbar />
        <div className="mx-auto mt-6 w-full max-w-4xl px-4 md:px-6">
          <Card title="Tidak Ada Akses" subtitle="Khusus Ketua, Sekretaris, atau root">
            <p className="text-sm text-[var(--text-muted)]">Anda tidak memiliki akses ke menu manajemen warga/admin.</p>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-10">
      <Navbar />
      <div className="mx-auto mt-6 w-full max-w-6xl space-y-5 px-4 md:px-6">
        <Card title="Manajemen Warga" subtitle="Tambah warga baru dan tunjuk role admin sesuai kebutuhan">
          <div className="grid gap-3 md:grid-cols-4">
            <Input label="Nama Warga" value={newNama} onChange={(e) => setNewNama(e.target.value)} placeholder="Nama lengkap" />
            <Input label="Nomor HP" value={newNoHp} onChange={(e) => setNewNoHp(e.target.value)} placeholder="08xxxxxxxxxx" />
            <Input label="PIN" value={newPin} onChange={(e) => setNewPin(e.target.value)} placeholder="4-6 digit" />
            <div className="flex items-end">
              <Button className="w-full" onClick={handleAddWarga} disabled={savingUser}>
                {savingUser ? 'Menyimpan...' : 'Tambah Warga'}
              </Button>
            </div>
          </div>
          <p className="mt-3 text-xs text-[var(--text-muted)]">Default role user baru otomatis `Warga` (id 11) pada tabel `user_roles`.</p>
        </Card>

        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div> : null}

        <Card title="Penunjukan Admin" subtitle="Ketua/Sekretaris dapat menunjuk warga menjadi admin modul tertentu">
          <div className="space-y-3">
            {users.map((row) => {
              const uid = String(row.id);
              const selected = selectedRoles[uid] || [];
              return (
                <div key={uid} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{row.nama}</p>
                      <p className="text-xs text-[var(--text-muted)]">{row.no_hp || '-'}</p>
                    </div>
                    <Button
                      variant="ghost"
                      className="px-3 py-1.5 text-xs"
                      onClick={() => void saveAdminRoles(uid)}
                      disabled={savingRoleUserId === uid}
                    >
                      {savingRoleUserId === uid ? 'Menyimpan...' : 'Simpan Role Admin'}
                    </Button>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    {adminRoles.map((role) => (
                      <label key={`${uid}-${role.id}`} className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-xs">
                        <input
                          type="checkbox"
                          checked={selected.includes(Number(role.id))}
                          onChange={() => toggleRole(uid, Number(role.id))}
                        />
                        <span>{role.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </main>
  );
}
