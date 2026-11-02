import { enqueueJimpitanMonthlyCloseNotification, getJimpitanMonthlyCloseJob, requeueFailedJimpitanMonthlyCloseNotification } from '../models/jimpitanGroupOutboxModel.js';
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


export async function sendJimpitanMonthlyCloseManually(req, res) {
  const monthKey = String(req.body?.month_key || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
    return res.status(400).json({ success: false, message: 'Periode rekap harus berformat YYYY-MM.' });
  }

  const [year, month] = monthKey.split('-').map(Number);
  const nowParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit'
  }).formatToParts(new Date());
  const now = Object.fromEntries(nowParts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  const currentMonth = `${now.year}-${now.month}`;
  if (monthKey >= currentMonth) {
    return res.status(400).json({ success: false, message: 'Rekap hanya bisa dikirim untuk bulan yang sudah berlalu.' });
  }

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const operationalDate = `${monthKey}-${String(lastDay).padStart(2, '0')}`;
  let job = await getJimpitanMonthlyCloseJob(monthKey);
  if (job?.status === 'SENT') {
    return res.json({ success: true, status: 'SENT', message: `Rekap ${monthKey} sudah pernah terkirim; tidak dikirim ulang.` });
  }
  if (job?.status === 'UNCERTAIN' || job?.status === 'PROCESSING') {
    return res.status(409).json({ success: false, status: job.status, message: `Status rekap ${monthKey} ${job.status}. Tidak dikirim ulang otomatis untuk mencegah pesan ganda; periksa grup WhatsApp terlebih dahulu.` });
  }
  if (job?.status === 'PENDING') {
    return res.json({ success: true, status: 'PENDING', message: `Rekap ${monthKey} sudah masuk antrean pengiriman.` });
  }
  if (job?.status === 'FAILED') {
    job = await requeueFailedJimpitanMonthlyCloseNotification(job.id);
    if (job) return res.json({ success: true, status: 'PENDING', message: `Rekap ${monthKey} yang gagal dimasukkan kembali ke antrean.` });
    job = await getJimpitanMonthlyCloseJob(monthKey);
  }
  if (!job) {
    job = await enqueueJimpitanMonthlyCloseNotification({ monthKey, operationalDate });
    if (job) return res.json({ success: true, status: 'PENDING', message: `Rekap ${monthKey} dimasukkan ke antrean pengiriman.` });
    job = await getJimpitanMonthlyCloseJob(monthKey);
  }

  if (job?.status === 'SENT') {
    return res.json({ success: true, status: 'SENT', message: `Rekap ${monthKey} sudah pernah terkirim; tidak dikirim ulang.` });
  }
  return res.status(409).json({ success: false, status: job?.status || 'UNKNOWN', message: `Status rekap ${monthKey} berubah menjadi ${job?.status || 'tidak diketahui'}. Muat ulang status sebelum mencoba lagi.` });
}
