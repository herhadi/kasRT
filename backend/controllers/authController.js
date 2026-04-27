import jwt from 'jsonwebtoken';
import {
  findUserById,
  findUserForLogin,
  findUserRoles,
  listWargaDropdownOptions
} from '../models/authModel.js';

export async function login(req, res) {
  const { no_hp, pin } = req.body;

  const user = await findUserForLogin(no_hp);
  if (!user) {
    return res.json({ success: false, message: 'User tidak ditemukan' });
  }

  if (user.pin !== pin) {
    return res.json({ success: false, message: 'PIN salah' });
  }

  const roles = await findUserRoles(user.id);

  const token = jwt.sign(
    {
      user_id: user.id,
      roles
    },
    process.env.JWT_SECRET,
    { expiresIn: '1d' }
  );

  return res.json({
    success: true,
    token,
    user: {
      id: user.id,
      nama: user.nama,
      roles,
      telegram_connected: Boolean(user.telegram_chat_id)
    }
  });
}

export async function me(req, res) {
  const userId = req.user.user_id;

  const user = await findUserById(userId);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
  }

  const roles = await findUserRoles(userId);

  return res.json({
    success: true,
    user: {
      id: user.id,
      nama: user.nama,
      no_hp: user.no_hp,
      roles,
      telegram_connected: Boolean(user.telegram_chat_id)
    }
  });
}

export async function getWargaOptions(_req, res) {
  try {
    const data = await listWargaDropdownOptions();
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}
