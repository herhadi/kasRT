import {
  createWargaUser,
  listAssignableAdminRoles,
  listUsersWithRoles,
  setUserAdminRoles
} from '../models/managementModel.js';

export async function getUserManagementData(_req, res) {
  try {
    const [users, adminRoles] = await Promise.all([
      listUsersWithRoles(),
      listAssignableAdminRoles()
    ]);
    return res.json({ success: true, data: { users, admin_roles: adminRoles } });
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

  if (!userId) {
    return res.status(400).json({ success: false, message: 'user id tidak valid' });
  }

  try {
    await setUserAdminRoles({ userId, roleIds });
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}
