const express = require('express');
const ytdl    = require('@distube/ytdl-core');
const fs      = require('fs');
const path    = require('path');
const router  = express.Router();

/* ── Load cookies ────────────────────────────────
   cookies.json lives at /app/cookies.json in Docker
   process.cwd() = /app  (always correct)
─────────────────────────────────────────────── */
function getAgent() {
  try {
    // Use process.cwd() so it works regardless of __dirname
    const cookiePath = path.join(process.cwd(), 'cookies.json');
    console.log('[COOKIES] Looking for cookies at:', cookiePath);
    if (fs.existsSync(cookiePath)) {
      const raw = fs.readFileSync(cookiePath, 'utf8');
      const cookies = JSON.parse(raw);
      if (Array.isArray(cookies) && cookies.length > 0) {
        console.log(`[COOKIES] Loaded ${cookies.length} cookies ✅`);
        return ytdl.createAgent(cookies);
      } else {
        console.warn('[COOKIES] cookies.json is empty or invalid');
      }
    } else {
      console.warn('[COOKIES] cookies.json not found at', cookiePath);
    }
  } catch (e) {
    console.error('[COOKIES] Error loading cookies:', e.message);
  }
  return undefined;
}

function formatDuration(seconds) {
  if (!seconds) return 'N/A';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function getBestThumbnail(thumbnails) {
  if (!thumbnails || thumbnails.length === 0) return '';
  return thumbnails.reduce((best, t) => {
    const area = (t.width || 0) * (t.height || 0);
    return area > (best.width || 0) * (best.height || 0) ? t : best;
  }).url;
}

function parseVideoFormats(formats) {
  const QUALITIES = ['144p','240p','360p','480p','720p','1080p','1440p','2160p'];
  const seen = new Set();
  const result = [];
  const all = [
    ...formats.filter(f => f.hasVideo && f.hasAudio && f.container === 'mp4').sort((a,b) => (b.bitrate||0)-(a.bitrate||0)),
    ...formats.filter(f => f.hasVideo && !f.hasAudio && f.container === 'mp4').sort((a,b) => (b.bitrate||0)-(a.bitrate||0)),
  ];
  for (const fmt of all) {
    const q = fmt.qualityLabel;
    if (!q) continue;
    const norm = q.replace(/[^0-9p]/g,'').replace(/(\d+p)\d*/,'$1');
    if (!QUALITIES.includes(norm) || seen.has(norm)) continue;
    seen.add(norm);
    result.push({ quality: norm, itag: fmt.itag, hasAudio: fmt.hasAudio, hasVideo: fmt.hasVideo });
  }
  return result.sort((a,b) => parseInt(b.quality)-parseInt(a.quality));
}

router.get('/', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter.' });
  if (!ytdl.validateURL(url)) return res.status(400).json({ error: 'Invalid YouTube URL.' });

  try {
    const agent = getAgent();
    const opts  = agent ? { agent } : {};
    console.log('[INFO] Fetching info, cookies loaded:', !!agent);
    const info  = await ytdl.getInfo(url, opts);
    const { videoDetails, formats } = info;

    const audioFormats = formats
      .filter(f => f.hasAudio && !f.hasVideo)
      .sort((a,b) => (b.audioBitrate||0)-(a.audioBitrate||0));

    res.json({
      videoId    : videoDetails.videoId,
      title      : videoDetails.title,
      channel    : videoDetails.author?.name || 'Unknown',
      duration   : formatDuration(parseInt(videoDetails.lengthSeconds)),
      durationSec: parseInt(videoDetails.lengthSeconds),
      views      : parseInt(videoDetails.viewCount || 0).toLocaleString(),
      thumbnail  : getBestThumbnail(videoDetails.thumbnails),
      videoFormats: parseVideoFormats(formats),
      audioItag  : audioFormats[0]?.itag,
    });

  } catch (err) {
    console.error('[INFO ERROR]', err.message);
    if (err.message?.includes('private'))
      return res.status(403).json({ error: 'This video is private.' });
    if (err.message?.includes('429') || err.message?.includes('rate'))
      return res.status(429).json({ error: 'YouTube blocked this request. Try refreshing your cookies.json file.' });
    res.status(500).json({ error: 'Could not fetch video info: ' + err.message });
  }
});

module.exports = router;
