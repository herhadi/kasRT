import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';

import authRoutes from './routes/auth.js';
import jimpitanRoutes from './routes/jimpitan.js';
import reportRoutes from './routes/report.js';
import transactionRoutes from './routes/transaction.js';
import telegramRoutes from './routes/telegram.js';
import approvalRoutes from './routes/approval.js';
import managementRoutes from './routes/management.js';
import bendaharaRoutes from './routes/bendahara.js';
import tabunganRoutes from './routes/tabungan.js';
import internetRoutes from './routes/internet.js';
import lingkunganRoutes from './routes/lingkungan.js';
import koperasiRoutes from './routes/koperasi.js';
import membershipRequestRoutes from './routes/membershipRequest.js';
import securityRoutes from './routes/security.js';
import migrationRoutes from './routes/migration.js';
import { ensureCoreMasterData } from './models/bootstrapModel.js';
import { ensureInternetTables } from './models/internetModel.js';
import { ensureLingkunganTables } from './models/lingkunganModel.js';
import { ensureKoperasiTables } from './models/koperasiModel.js';
import { ensureSecurityTables } from './models/securityModel.js';
import { ensureAssetTables } from './models/assetModel.js';
import { ensureAppSettingsTable } from './models/appSettingModel.js';
import { ensureMembershipRequestTables } from './models/membershipRequestModel.js';

const app = express();
const PORT = Number(process.env.PORT || 3005);
const corsOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || corsOrigins.length === 0 || corsOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin tidak diizinkan'));
  }
}));
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/jimpitan', jimpitanRoutes);
app.use('/report', reportRoutes);
app.use('/transaction', transactionRoutes);
app.use('/telegram', telegramRoutes);
app.use('/approval', approvalRoutes);
app.use('/management', managementRoutes);
app.use('/bendahara', bendaharaRoutes);
app.use('/tabungan', tabunganRoutes);
app.use('/internet', internetRoutes);
app.use('/lingkungan', lingkunganRoutes);
app.use('/koperasi', koperasiRoutes);
app.use('/membership', membershipRequestRoutes);
app.use('/security', securityRoutes);
app.use('/migration', migrationRoutes);

app.get('/api/cron', (_req, res) => {
  return res.json({
    success: true,
    message: 'Cron endpoint OK',
    timestamp: new Date().toISOString()
  });
});

app.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'KasRT Backend API aktif'
  });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({
    success: false,
    message: 'Terjadi kesalahan pada server'
  });
});

async function startServer() {
  try {
    await ensureCoreMasterData();
    await ensureInternetTables();
    await ensureLingkunganTables();
    await ensureKoperasiTables();
    await ensureMembershipRequestTables();
    await ensureSecurityTables();
    await ensureAssetTables();
    await ensureAppSettingsTable();
    console.log('✅ Master data roles/wallets/contribution_types siap');
  } catch (error) {
    console.error('❌ Gagal memastikan master data:', error.message);
  }

  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

void startServer();
