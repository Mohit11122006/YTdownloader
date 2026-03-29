/**
 * ╔══════════════════════════════════════════════════╗
 * ║         YTFlow — YouTube Downloader API          ║
 * ║         Node.js + Express + ytdl-core            ║
 * ╚══════════════════════════════════════════════════╝
 */

const express      = require('express');
const cors         = require('cors');
const path         = require('path');
const rateLimit    = require('express-rate-limit');

const infoRouter     = require('./routes/info');
const downloadRouter = require('./routes/download');

const app  = express();
const PORT = process.env.PORT || 3001;

/* ─── Middleware ─────────────────────────────────── */
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the frontend from /frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Rate limiting – 30 requests per minute per IP
const limiter = rateLimit({
  windowMs : 60 * 1000,
  max      : 30,
  message  : { error: 'Too many requests. Please slow down.' },
});
app.use('/api/', limiter);

/* ─── API Routes ──────────────────────────────────── */
app.use('/api/info',     infoRouter);
app.use('/api/download', downloadRouter);

/* ─── Health check ────────────────────────────────── */
app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date() }));

/* ─── SPA fallback ────────────────────────────────── */
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

/* ─── Start ───────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`\n🚀  YTFlow server running at http://localhost:${PORT}\n`);
});
