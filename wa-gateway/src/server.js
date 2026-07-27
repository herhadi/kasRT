import express from 'express';
import { assertConfig, config } from './config.js';
import { getQr, getStatus, resetSession, sendTestMessage, startWhatsApp } from './whatsapp.js';
import { getUsage } from './store.js';

assertConfig();

const app = express();
app.use(express.json({ limit: '128kb' }));

function requireSecret(req, res, next) {
  const headerSecret = String(req.headers['x-wa-lab-secret'] || req.headers['x-wa-gateway-secret'] || '').trim();
  const bearerSecret = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (headerSecret === config.secret || bearerSecret === config.secret) return next();
  return res.status(403).json({ success: false, message: 'Forbidden' });
}

app.get('/health', (_req, res) => {
  res.json({ success: true, service: 'kasrt-wa-gateway-lab' });
});

app.get('/status', requireSecret, async (_req, res) => {
  const usage = await getUsage();
  res.json({
    success: true,
    data: {
      ...getStatus(),
      usage: {
        date: usage.date,
        unique_recipients: usage.uniqueRecipients.length,
        daily_unique_limit: config.dailyUniqueLimit
      }
    }
  });
});

app.get('/qr', requireSecret, (_req, res) => {
  res.json({ success: true, data: getQr() });
});

app.post('/send-test', requireSecret, async (req, res) => {
  try {
    const data = await sendTestMessage({
      phone: req.body?.phone,
      text: req.body?.text
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/session/reset', requireSecret, async (req, res) => {
  if (String(req.body?.confirm || '') !== 'RESET') {
    return res.status(400).json({ success: false, message: 'Kirim body confirm=RESET untuk reset session.' });
  }
  await resetSession();
  return res.json({ success: true, message: 'Session direset. Ambil QR baru dari /qr.' });
});

app.listen(config.port, '0.0.0.0', async () => {
  console.log(`KasRT WA Gateway Lab running on :${config.port}`);
  startWhatsApp().catch((error) => {
    console.error('WA startup failed:', error.message);
  });
});
