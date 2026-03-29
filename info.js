/**
 * GET /api/info?url=<youtubeUrl>
 * Returns video metadata: title, thumbnail, duration, channel, formats
 */

const express = require('express');
const ytdl    = require('@distube/ytdl-core');
const router  = express.Router();

/* ── Helpers ─────────────────────────────────────── */

/** Convert seconds → "HH:MM:SS" or "MM:SS" */
function formatDuration(seconds) {
  if (!seconds) return 'N/A';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

/** Pick the best thumbnail (highest resolution) */
function getBestThumbnail(thumbnails) {
  if (!thumbnails || thumbnails.length === 0) return '';
  return thumbnails.reduce((best, t) => {
    const area = (t.width || 0) * (t.height || 0);
    return area > (best.width || 0) * (best.height || 0) ? t : best;
  }).url;
}

/** Normalise available video formats into clean quality options */
function parseVideoFormats(formats) {
  const QUALITIES = ['144p','240p','360p','480p','720p','1080p','1440p','2160p'];
  const seen = new Set();
  const result = [];

  // Prefer formats that have both video+audio (progressive)
  const progressive = formats
    .filter(f => f.hasVideo && f.hasAudio && f.container === 'mp4')
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

  // Also include adaptive (video-only) for higher qualities
  const adaptive = formats
    .filter(f => f.hasVideo && !f.hasAudio && f.container === 'mp4')
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

  const all = [...progressive, ...adaptive];

  for (const fmt of all) {
    const q = fmt.qualityLabel;
    if (!q) continue;
    // Normalise: strip extra chars like "720p60" → "720p"
    const normalised = q.replace(/[^0-9p]/g, '').replace(/(\d+p)\d*/,'$1');
    if (!QUALITIES.includes(normalised)) continue;
    if (seen.has(normalised)) continue;
    seen.add(normalised);
    result.push({
      quality     : normalised,
      itag        : fmt.itag,
      mimeType    : fmt.mimeType,
      hasAudio    : fmt.hasAudio,
      hasVideo    : fmt.hasVideo,
      contentLength: fmt.contentLength,
    });
  }

  // Sort by quality descending
  result.sort((a, b) => parseInt(b.quality) - parseInt(a.quality));
  return result;
}

/* ── Route ───────────────────────────────────────── */
router.get('/', async (req, res) => {
  const { url } = req.query;

  if (!url) return res.status(400).json({ error: 'Missing url parameter.' });
  if (!ytdl.validateURL(url)) return res.status(400).json({ error: 'Invalid YouTube URL.' });

  try {
    const info = await ytdl.getInfo(url);
    const { videoDetails, formats } = info;

    const videoFormats = parseVideoFormats(formats);

    // Best audio format (highest abr)
    const audioFormats = formats
      .filter(f => f.hasAudio && !f.hasVideo)
      .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));

    const bestAudio = audioFormats[0];

    res.json({
      videoId   : videoDetails.videoId,
      title     : videoDetails.title,
      channel   : videoDetails.author?.name || 'Unknown',
      duration  : formatDuration(parseInt(videoDetails.lengthSeconds)),
      durationSec: parseInt(videoDetails.lengthSeconds),
      views     : parseInt(videoDetails.viewCount || 0).toLocaleString(),
      thumbnail : getBestThumbnail(videoDetails.thumbnails),
      videoFormats,
      audioItag : bestAudio?.itag,
    });

  } catch (err) {
    console.error('[INFO ERROR]', err.message);

    if (err.message?.includes('private')) {
      return res.status(403).json({ error: 'This video is private.' });
    }
    if (err.message?.includes('age')) {
      return res.status(403).json({ error: 'Age-restricted video.' });
    }
    res.status(500).json({ error: 'Could not fetch video info. ' + err.message });
  }
});

module.exports = router;
