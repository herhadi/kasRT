import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { getWhatsAppQr, getWhatsAppStatus, sendWhatsAppMessage, startWhatsApp } from './whatsapp.js';

const app = express();
const port = Number(process.env.PORT || 3010);

app.use(cors());
app.use(express.json({ limit: '1mb' }));

function normalizeWaPhone(value) {
  const raw = String(value || '').replace(/[^\d]/g, '');
  if (!raw) return '';
  if (raw.startsWith('62')) return raw;
  if (raw.startsWith('0')) return `62${raw.slice(1)}`;
  return raw;
}

function isValidWaPhone(value) {
  return /^628\d{7,13}$/.test(normalizeWaPhone(value));
}

function requireGatewaySecret(req, res, next) {
  const configuredSecret = String(process.env.WA_GATEWAY_SECRET || '').trim();
  if (!configuredSecret) return next();

  const incomingSecret = String(req.headers['x-wa-gateway-secret'] || '').trim();
  const authHeader = String(req.headers.authorization || '').trim();
  const bearerSecret = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';

  if (incomingSecret === configuredSecret || bearerSecret === configuredSecret) {
    return next();
  }

  return res.status(403).json({ success: false, message: 'Forbidden: invalid WA gateway secret' });
}

app.get('/', (_req, res) => {
  res.json({
    success: true,
    service: 'kasrt-wa-gateway',
    status: getWhatsAppStatus()
  });
});

app.get('/status', requireGatewaySecret, (_req, res) => {
  res.json({ success: true, data: getWhatsAppStatus() });
});

app.get('/qr', requireGatewaySecret, (_req, res) => {
  const qr = getWhatsAppQr();
  res.json({
    success: true,
    data: {
      ...qr,
      status: getWhatsAppStatus()
    }
  });
});

app.post('/send', requireGatewaySecret, async (req, res) => {
  const target = normalizeWaPhone(req.body.target);
  const message = String(req.body.message || '').trim();

  if (!isValidWaPhone(target)) {
    return res.status(400).json({
      success: false,
      sent: false,
      message: 'target invalid. Gunakan format 628xxxxxxxxxx.'
    });
  }

  if (!message) {
    return res.status(400).json({ success: false, sent: false, message: 'message wajib diisi' });
  }

  try {
    const result = await sendWhatsAppMessage(target, message);
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(503).json({
      success: false,
      sent: false,
      message: error?.message || 'Gagal mengirim WA'
    });
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ success: false, message: 'Terjadi kesalahan pada WA gateway' });
});

app.listen(port, () => {
  console.log(`KasRT WA Gateway running on :${port}`);
  void startWhatsApp();
});
