/**
 * ╔══════════════════════════════════════════════════╗
 * ║         YTFlow — YouTube Downloader API          ║
 * ║         Node.js + Express + ytdl-core            ║
 * ╚══════════════════════════════════════════════════╝
 */

const express      = require('express');
const cors         = require('cors');
const path         = require('path');
const fs           = require('fs');
const rateLimit    = require('express-rate-limit');

const infoRouter     = require('./routes/info');
const downloadRouter = require('./routes/download');

const app  = express();
const PORT = process.env.PORT || 3001;

/* ─── Resolve frontend path ──────────────────────────
   Locally:  ../frontend  (ytflow/frontend/)
   Docker:   /frontend    (copied to root in Dockerfile)
─────────────────────────────────────────────────── */
const localFrontend  = path.join(__dirname, '../frontend');
const dockerFrontend = '/frontend';
const FRONTEND_PATH  = fs.existsSync(localFrontend) ? localFrontend : dockerFrontend;

/* ─── Middleware ─────────────────────────────────── */
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the frontend statically
app.use(express.static(FRONTEND_PATH));

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
  res.sendFile(path.join(FRONTEND_PATH, 'index.html'));
});

/* ─── Start ───────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`\n🚀  YTFlow server running at http://localhost:${PORT}`);
  console.log(`📁  Serving frontend from: ${FRONTEND_PATH}\n`);
});
