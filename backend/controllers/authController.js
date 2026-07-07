import jwt from 'jsonwebtoken';
import {
  findUserById,
  findUserForLogin,
  findUserRoles,
  listWargaDropdownOptions,
  updateLastLoginById,
  updateUserPinById,
  updateUserProfileById
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
  await updateLastLoginById(user.id);

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
      telegram_connected: Boolean(user.telegram_chat_id),
      must_change_pin: String(user.pin || '') === String(process.env.DEFAULT_USER_PIN || '1234')
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

export async function changeMyPin(req, res) {
  const userId = req.user.user_id;
  const { old_pin, new_pin, repeat_new_pin } = req.body || {};
  const oldPin = String(old_pin || '').trim();
  const newPin = String(new_pin || '').trim();
  const repeatPin = String(repeat_new_pin || '').trim();

  if (!newPin || !repeatPin) {
    return res.status(400).json({ success: false, message: 'PIN baru wajib diisi.' });
  }
  if (!/^\d{4,6}$/.test(newPin)) {
    return res.status(400).json({ success: false, message: 'PIN baru harus 4 sampai 6 digit angka.' });
  }
  if (newPin !== repeatPin) {
    return res.status(400).json({ success: false, message: 'Ulangi PIN baru tidak sama.' });
  }

  const current = await findUserById(userId);
  const loginShape = await findUserForLogin(current?.no_hp || '');
  if (!current || !loginShape) {
    return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
  }

  const isDefaultPinUser = String(loginShape.pin || '') === String(process.env.DEFAULT_USER_PIN || '1234');
  if (!oldPin && !isDefaultPinUser) {
    return res.status(400).json({ success: false, message: 'PIN lama wajib diisi.' });
  }

  if (oldPin && String(loginShape.pin || '') !== oldPin) {
    return res.status(400).json({ success: false, message: 'PIN lama tidak sesuai.' });
  }
  if (String(loginShape.pin || '') === newPin) {
    return res.status(400).json({ success: false, message: 'PIN baru harus berbeda dari PIN lama.' });
  }

  await updateUserPinById(userId, newPin);
  return res.json({ success: true, message: 'PIN berhasil diperbarui.' });
}

export async function updateMyProfile(req, res) {
  const userId = req.user.user_id;
  const { nama, no_hp } = req.body || {};
  if (!String(nama || '').trim()) {
    return res.status(400).json({ success: false, message: 'Nama wajib diisi.' });
  }
  if (!String(no_hp || '').trim()) {
    return res.status(400).json({ success: false, message: 'Nomor HP wajib diisi.' });
  }

  const updated = await updateUserProfileById(userId, { nama, no_hp });
  if (!updated) {
    return res.status(400).json({ success: false, message: 'Tidak ada data yang diperbarui.' });
  }

  const roles = await findUserRoles(userId);
  return res.json({
    success: true,
    message: 'Profil berhasil diperbarui.',
    user: {
      id: updated.id,
      nama: updated.nama,
      no_hp: updated.no_hp,
      roles,
      telegram_connected: Boolean(updated.telegram_chat_id)
    }
  });
}
