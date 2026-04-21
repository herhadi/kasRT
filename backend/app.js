import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './routes/auth.js';
import jimpitanRoutes from './routes/jimpitan.js';
import reportRoutes from './routes/report.js';
import transactionRoutes from './routes/transaction.js';
import telegramRoutes from './routes/telegram.js';

const app = express();
const PORT = process.env.PORT;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '../frontend');

app.use(cors());
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/jimpitan', jimpitanRoutes);
app.use('/report', reportRoutes);
app.use('/transaction', transactionRoutes);
app.use('/telegram', telegramRoutes);

app.use(express.static(frontendDir));

app.get('/', (_req, res) => {
  res.sendFile(path.join(frontendDir, 'login.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({
    success: false,
    message: 'Terjadi kesalahan pada server'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 API running on port ${PORT}`);
});
