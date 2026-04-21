import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';

import authRoutes from './routes/auth.js';
import jimpitanRoutes from './routes/jimpitan.js';
import transactionRoutes from './routes/transaction.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/jimpitan', jimpitanRoutes);
app.use('/transaction', transactionRoutes);

app.listen(PORT, () => {
  console.log(`🚀 API running on port ${PORT}`);
});