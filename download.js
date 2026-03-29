/**
 * GET /api/download
 * Query params:
 *   url     – YouTube URL
 *   type    – "mp3" | "mp4"
 *   itag    – format itag (for mp4 quality selection)
 *   quality – quality label (for display, e.g. "720p")
 *
 * For MP3: streams audio → FFmpeg → MP3 with embedded thumbnail + metadata
 * For MP4: streams chosen format (merges audio if adaptive)
 */

const express    = require('express');
const ytdl       = require('@distube/ytdl-core');
const ffmpeg     = require('fluent-ffmpeg');
const fetch      = require('node-fetch');
const sanitize   = require('sanitize-filename');
const { Readable } = require('stream');
const os         = require('os');
const fs         = require('fs');
const path       = require('path');
const { PassThrough } = require('stream');

const router = express.Router();

/* ── Helper: download thumbnail to temp file ─────── */
async function downloadThumbnail(url) {
  try {
    const res  = await fetch(url);
    const buf  = await res.buffer();
    const tmp  = path.join(os.tmpdir(), `thumb_${Date.now()}.jpg`);
    fs.writeFileSync(tmp, buf);
    return tmp;
  } catch {
    return null;
  }
}

/* ── Helper: safe filename ───────────────────────── */
function safeFilename(title, ext) {
  const clean = sanitize(title).replace(/\s+/g, '_').substring(0, 100);
  return `${clean}.${ext}`;
}

/* ══════════════════════════════════════════════════
   MP3 Download (audio + embedded cover + metadata)
══════════════════════════════════════════════════ */
async function handleMp3(req, res) {
  const { url } = req.query;
  if (!ytdl.validateURL(url)) return res.status(400).json({ error: 'Invalid URL' });

  let info, thumbPath;
  try {
    info = await ytdl.getInfo(url);
  } catch (err) {
    return res.status(500).json({ error: 'Could not fetch video: ' + err.message });
  }

  const { videoDetails } = info;
  const title    = videoDetails.title;
  const artist   = videoDetails.author?.name || 'Unknown';
  const thumbUrl = videoDetails.thumbnails?.at(-1)?.url;

  // Download thumbnail to temp file for embedding
  thumbPath = thumbUrl ? await downloadThumbnail(thumbUrl) : null;

  const filename = safeFilename(title, 'mp3');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'audio/mpeg');

  // Stream best audio from YouTube
  const audioStream = ytdl(url, {
    quality   : 'highestaudio',
    filter    : 'audioonly',
  });

  audioStream.on('error', (err) => {
    console.error('[YTDL AUDIO ERROR]', err.message);
    if (!res.headersSent) res.status(500).end();
  });

  // Build FFmpeg command
  const cmd = ffmpeg(audioStream)
    .audioBitrate(320)
    .audioCodec('libmp3lame')
    .format('mp3')
    // Embed metadata
    .outputOptions([
      '-metadata', `title=${title}`,
      '-metadata', `artist=${artist}`,
      '-metadata', `album=YouTube Downloads`,
      '-metadata', `comment=Downloaded via YTFlow`,
    ]);

  // Attach thumbnail as album art if available
  if (thumbPath) {
    cmd
      .input(thumbPath)
      .outputOptions([
        '-map', '0:a',
        '-map', '1:v',
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
    .on('end', () => {
      if (thumbPath) fs.unlink(thumbPath, () => {});
    })
    .pipe(res, { end: true });
}

/* ══════════════════════════════════════════════════
   MP4 Download
   - Progressive (has audio): stream directly
   - Adaptive (video-only): merge with best audio via FFmpeg
══════════════════════════════════════════════════ */
async function handleMp4(req, res) {
  const { url, itag, quality } = req.query;
  if (!ytdl.validateURL(url)) return res.status(400).json({ error: 'Invalid URL' });

  let info;
  try {
    info = await ytdl.getInfo(url);
  } catch (err) {
    return res.status(500).json({ error: 'Could not fetch video: ' + err.message });
  }

  const { videoDetails, formats } = info;
  const title = videoDetails.title;

  // Resolve the requested format
  const chosenItag = itag ? parseInt(itag) : null;
  const fmt = chosenItag
    ? formats.find(f => f.itag === chosenItag)
    : ytdl.chooseFormat(formats, { quality: 'highest', filter: 'audioandvideo' });

  if (!fmt) return res.status(404).json({ error: 'Requested format not available.' });

  const filename = safeFilename(`${title}${quality ? `_${quality}` : ''}`, 'mp4');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'video/mp4');

  if (fmt.hasAudio && fmt.hasVideo) {
    // ── Progressive: stream directly ──────────────
    const stream = ytdl(url, { format: fmt });
    stream.on('error', (err) => {
      console.error('[YTDL MP4 ERROR]', err.message);
      if (!res.headersSent) res.status(500).end();
    });
    stream.pipe(res);
  } else {
    // ── Adaptive: merge video + audio via FFmpeg ──
    const videoStream = ytdl(url, { format: fmt });
    const audioStream = ytdl(url, { quality: 'highestaudio', filter: 'audioonly' });

    const cmd = ffmpeg()
      .input(videoStream)
      .input(audioStream)
      .outputOptions([
        '-map', '0:v',
        '-map', '1:a',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-strict', 'experimental',
        '-movflags', 'frag_keyframe+empty_moov',
      ])
      .format('mp4');

    [videoStream, audioStream].forEach(s =>
      s.on('error', (e) => {
        console.error('[YTDL STREAM ERROR]', e.message);
        if (!res.headersSent) res.status(500).end();
      })
    );

    cmd
      .on('error', (err) => {
        console.error('[FFMPEG MP4 ERROR]', err.message);
        if (!res.headersSent) res.status(500).end();
      })
      .pipe(res, { end: true });
  }
}

/* ── Route entry point ───────────────────────────── */
router.get('/', async (req, res) => {
  const { type } = req.query;
  if (type === 'mp3') return handleMp3(req, res);
  if (type === 'mp4') return handleMp4(req, res);
  res.status(400).json({ error: 'type must be "mp3" or "mp4"' });
});

module.exports = router;
