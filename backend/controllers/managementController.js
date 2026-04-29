import {
  createWargaUser,
  getMeetingNoteByMonth,
  listAssignableOrganizationRoles,
  listUsersWithRoles,
  setUserOrganizationRoles,
  upsertMeetingNoteByMonth
} from '../models/managementModel.js';

export async function getUserManagementData(_req, res) {
  try {
    const [users, organizationRoles] = await Promise.all([
      listUsersWithRoles(),
      listAssignableOrganizationRoles()
    ]);
    return res.json({
      success: true,
      data: {
        users,
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

    if ((touchesLeadership || targetHasLeadership) && !isRoot) {
      return res.status(403).json({
        success: false,
        message: 'Role Ketua/Sekretaris hanya bisa ditunjuk oleh root'
      });
    }

    await setUserOrganizationRoles({ userId, roleIds });
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function getMeetingNote(req, res) {
  const month = String(req.query.month || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return res.status(400).json({ success: false, message: 'month tidak valid (YYYY-MM)' });
  }
  try {
    const data = await getMeetingNoteByMonth(month);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function saveMeetingNote(req, res) {
  const month = String(req.body.month || '').trim();
  const notes = String(req.body.notes || '').trim();
  const actorId = String(req.user?.user_id || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return res.status(400).json({ success: false, message: 'month tidak valid (YYYY-MM)' });
  }
  if (!notes) {
    return res.status(400).json({ success: false, message: 'notes wajib diisi' });
  }
  try {
    await upsertMeetingNoteByMonth({ month, notes, actorId });
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}
