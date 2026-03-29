/**
 * GET /api/download
 * Cookie-aware download handler for MP3 and MP4
 */

const express    = require('express');
const ytdl       = require('@distube/ytdl-core');
const ffmpeg     = require('fluent-ffmpeg');
const fetch      = require('node-fetch');
const sanitize   = require('sanitize-filename');
const os         = require('os');
const fs         = require('fs');
const path       = require('path');

const router = express.Router();

/* ── Load cookies agent ──────────────────────────── */
function getAgent() {
  try {
    const cookiePath = path.join(__dirname, 'cookies.json');
    if (fs.existsSync(cookiePath)) {
      const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
      return ytdl.createAgent(cookies);
    }
  } catch (e) {
    console.warn('[COOKIES] Failed to load:', e.message);
  }
  return undefined;
}

/* ── Helpers ─────────────────────────────────────── */
async function downloadThumbnail(url) {
  try {
    const res = await fetch(url);
    const buf = await res.buffer();
    const tmp = path.join(os.tmpdir(), `thumb_${Date.now()}.jpg`);
    fs.writeFileSync(tmp, buf);
    return tmp;
  } catch { return null; }
}

function safeFilename(title, ext) {
  const clean = sanitize(title).replace(/\s+/g, '_').substring(0, 100);
  return `${clean}.${ext}`;
}

/* ── MP3 Handler ─────────────────────────────────── */
async function handleMp3(req, res) {
  const { url } = req.query;
  if (!ytdl.validateURL(url)) return res.status(400).json({ error: 'Invalid URL' });

  let info;
  try {
    const agent = getAgent();
    info = await ytdl.getInfo(url, agent ? { agent } : {});
  } catch (err) {
    return res.status(500).json({ error: 'Could not fetch video: ' + err.message });
  }

  const { videoDetails } = info;
  const title    = videoDetails.title;
  const artist   = videoDetails.author?.name || 'Unknown';
  const thumbUrl = videoDetails.thumbnails?.at(-1)?.url;
  const thumbPath = thumbUrl ? await downloadThumbnail(thumbUrl) : null;

  const filename = safeFilename(title, 'mp3');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'audio/mpeg');

  const agent = getAgent();
  const audioStream = ytdl(url, {
    quality : 'highestaudio',
    filter  : 'audioonly',
    ...(agent ? { agent } : {}),
  });

  audioStream.on('error', (err) => {
    console.error('[YTDL AUDIO ERROR]', err.message);
    if (!res.headersSent) res.status(500).end();
  });

  const cmd = ffmpeg(audioStream)
    .audioBitrate(320)
    .audioCodec('libmp3lame')
    .format('mp3')
    .outputOptions([
      '-metadata', `title=${title}`,
      '-metadata', `artist=${artist}`,
      '-metadata', `album=YouTube Downloads`,
    ]);

  if (thumbPath) {
    cmd
      .input(thumbPath)
      .outputOptions([
        '-map', '0:a', '-map', '1:v',
        '-id3v2_version', '3',
        '-metadata:s:v', 'title=Album cover',
        '-metadata:s:v', 'comment=Cover (front)',
        '-c:v', 'copy',
      ]);
  }

  cmd
    .on('error', (err) => {
      console.error('[FFMPEG MP3 ERROR]', err.message);
      if (!res.headersSent) res.status(500).end();
      if (thumbPath) fs.unlink(thumbPath, () => {});
    })
    .on('end', () => { if (thumbPath) fs.unlink(thumbPath, () => {}); })
    .pipe(res, { end: true });
}

/* ── MP4 Handler ─────────────────────────────────── */
async function handleMp4(req, res) {
  const { url, itag, quality } = req.query;
  if (!ytdl.validateURL(url)) return res.status(400).json({ error: 'Invalid URL' });

  let info;
  const agent = getAgent();
  try {
    info = await ytdl.getInfo(url, agent ? { agent } : {});
  } catch (err) {
    return res.status(500).json({ error: 'Could not fetch video: ' + err.message });
  }

  const { videoDetails, formats } = info;
  const chosenItag = itag ? parseInt(itag) : null;
  const fmt = chosenItag
    ? formats.find(f => f.itag === chosenItag)
    : ytdl.chooseFormat(formats, { quality: 'highest', filter: 'audioandvideo' });

  if (!fmt) return res.status(404).json({ error: 'Requested format not available.' });

  const filename = safeFilename(`${videoDetails.title}${quality ? `_${quality}` : ''}`, 'mp4');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'video/mp4');

  if (fmt.hasAudio && fmt.hasVideo) {
    const stream = ytdl(url, { format: fmt, ...(agent ? { agent } : {}) });
    stream.on('error', (err) => {
      console.error('[YTDL MP4 ERROR]', err.message);
      if (!res.headersSent) res.status(500).end();
    });
    stream.pipe(res);
  } else {
    const videoStream = ytdl(url, { format: fmt, ...(agent ? { agent } : {}) });
    const audioStream = ytdl(url, { quality: 'highestaudio', filter: 'audioonly', ...(agent ? { agent } : {}) });

    ffmpeg()
      .input(videoStream)
      .input(audioStream)
      .outputOptions([
        '-map', '0:v', '-map', '1:a',
        '-c:v', 'copy', '-c:a', 'aac',
        '-movflags', 'frag_keyframe+empty_moov',
      ])
      .format('mp4')
      .on('error', (err) => {
        console.error('[FFMPEG MP4 ERROR]', err.message);
        if (!res.headersSent) res.status(500).end();
      })
      .pipe(res, { end: true });
  }
}

/* ── Route ───────────────────────────────────────── */
router.get('/', async (req, res) => {
  const { type } = req.query;
  if (type === 'mp3') return handleMp3(req, res);
  if (type === 'mp4') return handleMp4(req, res);
  res.status(400).json({ error: 'type must be "mp3" or "mp4"' });
});

module.exports = router;
