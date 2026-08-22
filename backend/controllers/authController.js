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
import { createPinResetRequestByNoHp } from '../models/managementModel.js';
import { recordLoginAudit } from '../models/loginAuditModel.js';
import { notifyRoles } from '../services/approvalNotifier.js';

function detectLoginClient(req) {
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 1000);
  const forwardedFor = String(req.headers['x-forwarded-for'] || '').slice(0, 500);
  const clientContext = req.body?.client_context || {};
  const ipAddress = String(
    req.headers['cf-connecting-ip'] ||
    forwardedFor.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    ''
  ).slice(0, 100);

  let deviceType = 'Desktop';
  if (/ipad|tablet|kindle|silk/i.test(userAgent)) deviceType = 'Tablet';
  else if (/mobile|iphone|ipod|android/i.test(userAgent)) deviceType = 'Mobile';

  let browser = 'Lainnya';
  if (/edg\//i.test(userAgent)) browser = 'Microsoft Edge';
  else if (/opr\//i.test(userAgent)) browser = 'Opera';
  else if (/crios\//i.test(userAgent)) browser = 'Google Chrome iOS';
  else if (/chrome\//i.test(userAgent)) browser = 'Google Chrome';
  else if (/fxios\//i.test(userAgent)) browser = 'Firefox iOS';
  else if (/firefox\//i.test(userAgent)) browser = 'Mozilla Firefox';
  else if (/safari\//i.test(userAgent) && /version\//i.test(userAgent)) browser = 'Safari';

  let operatingSystem = 'Lainnya';
  if (/windows nt/i.test(userAgent)) operatingSystem = 'Windows';
  else if (/android/i.test(userAgent)) operatingSystem = 'Android';
  else if (/iphone|ipad|ipod/i.test(userAgent)) operatingSystem = 'iOS/iPadOS';
  else if (/mac os x|macintosh/i.test(userAgent)) operatingSystem = 'macOS';
  else if (/linux/i.test(userAgent)) operatingSystem = 'Linux';

  return {
    ipAddress: ipAddress || null,
    forwardedFor: forwardedFor || null,
    countryCode: String(req.headers['cf-ipcountry'] || '').slice(0, 8) || null,
    userAgent: userAgent || null,
    deviceType,
    browser,
    operatingSystem,
    platform: String(clientContext.platform || '').slice(0, 100) || null,
    platformVersion: String(clientContext.platform_version || '').slice(0, 100) || null,
    deviceModel: String(clientContext.device_model || '').slice(0, 150) || null,
    architecture: String(clientContext.architecture || '').slice(0, 50) || null,
    bitness: String(clientContext.bitness || '').slice(0, 20) || null,
    language: String(clientContext.language || req.headers['accept-language'] || '').slice(0, 100) || null,
    timezone: String(clientContext.timezone || '').slice(0, 100) || null,
    origin: String(req.headers.origin || '').slice(0, 500) || null
  };
}

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
  await recordLoginAudit({ user, roles, context: detectLoginClient(req) }).catch((error) => {
    console.error('Gagal mencatat audit login:', error.message);
  });

  const token = jwt.sign(
    {
      user_id: user.id,
      roles
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
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
  if (!/^\d{6}$/.test(newPin)) {
    return res.status(400).json({ success: false, message: 'PIN baru harus minimal 6 dan maksimal 6 digit angka.' });
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

export async function requestPinReset(req, res) {
  const noHp = String(req.body?.no_hp || '').trim();
  if (!noHp) {
    return res.status(400).json({ success: false, message: 'Nomor HP wajib diisi.' });
  }

  try {
    const result = await createPinResetRequestByNoHp({ noHp });
    if (result.found && !result.alreadyPending) {
      await notifyRoles(
        ['Ketua', 'Plt Ketua', 'Sekretaris', 'root'],
        `🔐 <b>Permintaan Reset PIN</b>\n` +
          `Nama: <b>${result.user?.nama || '-'}</b>\n` +
          `No HP: <b>${result.user?.no_hp || noHp}</b>\n\n` +
          `Buka Inbox KasRT untuk reset PIN ke default.`
      ).catch(() => {});
    }

    return res.json({
      success: true,
      message: result.alreadyPending
        ? 'Permintaan reset PIN Anda masih menunggu diproses admin.'
        : 'Jika nomor terdaftar, permintaan reset PIN akan dikirim ke admin.'
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || 'Gagal mengirim permintaan reset PIN.' });
  }
}
