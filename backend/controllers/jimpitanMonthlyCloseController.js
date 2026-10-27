import { getAppSetting, upsertAppSetting } from '../models/appSettingModel.js';

const SETTING_KEY = 'jimpitan_monthly_close';
const DEFAULTS = { enabled: true, send_time: '08:00' };

function normalizeSettings(value) {
  return {
    enabled: typeof value?.enabled === 'boolean' ? value.enabled : DEFAULTS.enabled,
    send_time: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value?.send_time || ''))
      ? String(value.send_time)
      : DEFAULTS.send_time
  };
}

export async function getJimpitanMonthlyCloseSettings(_req, res) {
  const saved = await getAppSetting(SETTING_KEY, DEFAULTS);
  return res.json({ success: true, data: normalizeSettings(saved) });
}

export async function saveJimpitanMonthlyCloseSettings(req, res) {
  const enabled = req.body?.enabled;
  const sendTime = String(req.body?.send_time || '').trim();
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ success: false, message: 'Status pengiriman harus dipilih.' });
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(sendTime)) {
    return res.status(400).json({ success: false, message: 'Jam pengiriman harus berformat HH:mm.' });
  }
  await upsertAppSetting({
    keyName: SETTING_KEY,
    value: { enabled, send_time: sendTime },
    updatedBy: req.user?.user_id || null
  });
  return res.json({ success: true, data: { enabled, send_time: sendTime } });
}
