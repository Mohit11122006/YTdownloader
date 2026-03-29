const express   = require('express');
const { spawn } = require('child_process');
const sanitize  = require('sanitize-filename');
const path      = require('path');
const fs        = require('fs');
const router    = express.Router();

const COOKIES = path.join(process.cwd(), 'cookies.txt');

function cookieArgs() {
  return fs.existsSync(COOKIES) ? ['--cookies', COOKIES] : [];
}

function safeFile(title, ext) {
  return sanitize(title || 'download').replace(/\s+/g,'_').slice(0,80) + '.' + ext;
}

/* ── MP3 ─────────────────────────────────────────── */
function handleMp3(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url' });

  const tmp  = `/tmp/ytf_${Date.now()}`;
  const args = [
    ...cookieArgs(),
    '--no-playlist', '--no-warnings',
    '-f', 'bestaudio',
    '-x', '--audio-format', 'mp3', '--audio-quality', '0',
    '--embed-thumbnail', '--add-metadata',
    '-o', `${tmp}.%(ext)s`,
    url,
  ];

  console.log('[MP3] yt-dlp', args.join(' '));
  const proc = spawn('yt-dlp', args);
  let errOut = '';
  proc.stderr.on('data', d => { errOut += d; process.stderr.write(d); });

  proc.on('close', code => {
    if (code !== 0) {
      if (!res.headersSent)
        res.status(500).json({ error: 'yt-dlp failed: ' + errOut.slice(0,200) });
      return;
    }
    const file = [`${tmp}.mp3`,`${tmp}.m4a`,`${tmp}.opus`].find(f => fs.existsSync(f));
    if (!file) return res.status(500).json({ error: 'Output file missing.' });
    res.setHeader('Content-Disposition','attachment; filename="ytflow.mp3"');
    res.setHeader('Content-Type','audio/mpeg');
    res.setHeader('Content-Length', fs.statSync(file).size);
    const s = fs.createReadStream(file);
    s.pipe(res);
    s.on('close', () => fs.unlink(file, ()=>{}));
  });
  req.on('close', () => proc.kill());
}

/* ── MP4 ─────────────────────────────────────────── */
function handleMp4(req, res) {
  const { url, quality } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url' });

  const h   = parseInt(quality) || 1080;
  const tmp = `/tmp/ytf_${Date.now()}`;
  const fmt = `bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best`;

  const args = [
    ...cookieArgs(),
    '--no-playlist', '--no-warnings',
    '-f', fmt,
    '--merge-output-format', 'mp4',
    '-o', `${tmp}.%(ext)s`,
    url,
  ];

  console.log('[MP4] yt-dlp', args.join(' '));
  const proc = spawn('yt-dlp', args);
  let errOut = '';
  proc.stderr.on('data', d => { errOut += d; process.stderr.write(d); });

  proc.on('close', code => {
    if (code !== 0) {
      if (!res.headersSent)
        res.status(500).json({ error: 'yt-dlp failed: ' + errOut.slice(0,200) });
      return;
    }
    const file = [`${tmp}.mp4`,`${tmp}.mkv`,`${tmp}.webm`].find(f => fs.existsSync(f));
    if (!file) return res.status(500).json({ error: 'Output file missing.' });
    const label = quality ? `_${quality}` : '';
    res.setHeader('Content-Disposition',`attachment; filename="ytflow${label}.mp4"`);
    res.setHeader('Content-Type','video/mp4');
    res.setHeader('Content-Length', fs.statSync(file).size);
    const s = fs.createReadStream(file);
    s.pipe(res);
    s.on('close', () => fs.unlink(file, ()=>{}));
  });
  req.on('close', () => proc.kill());
}

router.get('/', (req, res) => {
  const { type } = req.query;
  if (type === 'mp3') return handleMp3(req, res);
  if (type === 'mp4') return handleMp4(req, res);
  res.status(400).json({ error: 'type must be mp3 or mp4' });
});

module.exports = router;
