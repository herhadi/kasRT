import {
  createWargaUser,
  listAssignableOrganizationRoles,
  resetPinFromRequest,
  listUsersWithRoles,
  setUserOrganizationRoles,
  updateWargaUser
} from '../models/managementModel.js';
import { notifyUser } from '../services/approvalNotifier.js';

export async function getUserManagementData(req, res) {
  try {
    const isRoot = (req.user?.roles || []).some((role) => String(role).trim().toLowerCase() === 'root');
    const [users, organizationRoles] = await Promise.all([
      listUsersWithRoles(),
      listAssignableOrganizationRoles()
    ]);
    const visibleUsers = isRoot ? users : users.map(({ last_login_at: _lastLoginAt, ...user }) => user);
    return res.json({
      success: true,
      data: {
        users: visibleUsers,
        organization_roles: organizationRoles,
        admin_roles: organizationRoles
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function addWargaUser(req, res) {
  const nama = String(req.body.nama || '').trim();
  const noHp = String(req.body.no_hp || '').trim();
  const pin = String(req.body.pin || '').trim();

  if (!nama || !noHp || !pin) {
    return res.status(400).json({ success: false, message: 'nama, no_hp, dan pin wajib diisi' });
  }

  try {
    const user = await createWargaUser({ nama, noHp, pin });
    return res.json({ success: true, data: user });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function updateUserAdminRoles(req, res) {
  const userId = String(req.params.id || '').trim();
  const roleIds = Array.isArray(req.body.role_ids) ? req.body.role_ids : [];
  const actorRoles = (req.user?.roles || []).map((r) => String(r).toLowerCase());
  const isRoot = actorRoles.includes('root');
  const canManageLeadership = isRoot || actorRoles.includes('ketua') || actorRoles.includes('plt ketua');

  if (!userId) {
    return res.status(400).json({ success: false, message: 'user id tidak valid' });
  }

  try {
    const organizationRoles = await listAssignableOrganizationRoles();
    const ketuaRoleId = organizationRoles.find((r) => String(r.name).toLowerCase() === 'ketua')?.id;
    const sekretarisRoleId = organizationRoles.find((r) => String(r.name).toLowerCase() === 'sekretaris')?.id;
    const incoming = (roleIds || []).map((id) => Number(id));
    const allUsers = await listUsersWithRoles();
    const target = allUsers.find((u) => String(u.id) === userId);
    const targetHasLeadership =
      (target?.roles || []).some((role) => {
        const lowered = String(role).toLowerCase();
        return lowered === 'ketua' || lowered === 'sekretaris';
      });
    const touchesLeadership =
      (ketuaRoleId && incoming.includes(Number(ketuaRoleId))) ||
      (sekretarisRoleId && incoming.includes(Number(sekretarisRoleId)));

    if ((touchesLeadership || targetHasLeadership) && !canManageLeadership) {
      return res.status(403).json({
        success: false,
        message: 'Role Ketua/Sekretaris hanya bisa ditunjuk oleh Ketua, Plt Ketua, atau root'
      });
    }

    await setUserOrganizationRoles({ userId, roleIds });
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function editWargaUser(req, res) {
  const userId = String(req.params.id || '').trim();
  const nama = String(req.body.nama || '').trim();
  const noHp = String(req.body.no_hp || '').trim();
  const resetPin = Boolean(req.body.reset_pin === true);

  if (!userId) {
    return res.status(400).json({ success: false, message: 'user id tidak valid' });
  }
  if (!nama || !noHp) {
    return res.status(400).json({ success: false, message: 'nama dan no_hp wajib diisi' });
  }
  try {
    await updateWargaUser({ userId, nama, noHp, resetPin, defaultPin: '1234' });
    return res.json({
      success: true,
      message: resetPin
        ? 'Data warga diperbarui dan PIN di-reset ke default. User wajib ganti PIN saat login.'
        : 'Data warga berhasil diperbarui.'
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function resetPinRequest(req, res) {
  const requestId = String(req.params.id || '').trim();
  const actor = String(req.user?.user_id || '').trim();
  const actorName = String(req.user?.nama || req.user?.name || '').trim();
  if (!requestId) {
    return res.status(400).json({ success: false, message: 'request id tidak valid' });
  }

  try {
    const result = await resetPinFromRequest({ requestId, actorId: actor, defaultPin: '1234' });
    await notifyUser(
      result.user_id,
      `✅ <b>PIN KasRT Anda sudah di-reset</b>\n` +
        `PIN sementara: <b>1234</b>\n` +
        `Silakan login dan ganti PIN baru.`
    ).catch(() => {});
    return res.json({
      success: true,
      message: `PIN ${result.nama} berhasil di-reset ke default${actorName ? ` oleh ${actorName}` : ''}.`
    });
  } catch (error) {
    const status = error.code === 'ALREADY_RESET' ? 409 : 400;
    return res.status(status).json({ success: false, message: error.message });
  }
}
