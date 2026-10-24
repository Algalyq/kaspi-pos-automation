import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { PORT, ROOT_DIR } from './src/config.js';
import authRoutes from './src/routes/auth.js';
import invoiceRoutes from './src/routes/invoice.js';
import qrRoutes from './src/routes/qr.js';
import historyRoutes from './src/routes/history.js';
import refundRoutes from './src/routes/refund.js';
import sessionRoutes from './src/routes/session.js';
import { startPolling } from './src/polling.js';
import 'dotenv/config';

const app = express();

app.use(express.json());
app.use(express.static(path.join(ROOT_DIR, 'public')));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ─── API key gate ───
// POS_API_KEY set → every /api/* request needs matching X-Api-Key
// (constant-time compare). Unset → open, for local dev only.
const POS_API_KEY = process.env.POS_API_KEY;
if (!POS_API_KEY) {
  console.warn('  ⚠️  POS_API_KEY not set — /api/* is open. Set it before exposing this service.');
} else {
  app.use('/api', (req, res, next) => {
    const given = String(req.headers['x-api-key'] || '');
    const want = String(POS_API_KEY);
    const ok = given.length === want.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(want));
    if (!ok) return res.status(401).json({ error: 'Invalid or missing API key' });
    next();
  });
}

app.use('/api/auth', authRoutes);
app.use('/api/invoice', invoiceRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/refund', refundRoutes);
app.use('/api/session', sessionRoutes);

app.listen(PORT, () => {
  console.log(`\n  🟢 Kaspi Pay App running at http://localhost:${PORT}\n`);
  startPolling();
});
