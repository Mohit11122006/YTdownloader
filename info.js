const express   = require('express');
const { exec }  = require('child_process');
const path      = require('path');
const fs        = require('fs');
const router    = express.Router();

const COOKIES = path.join(process.cwd(), 'cookies.txt');

function fmtDuration(s) {
  if (!s) return 'N/A';
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  return h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
    : `${m}:${String(sec).padStart(2,'0')}`;
}

router.get('/', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url.' });
  if (!/youtu(\.be|be\.com)/.test(url))
    return res.status(400).json({ error: 'Invalid YouTube URL.' });

  const hasCookies = fs.existsSync(COOKIES);
  const cookieFlag = hasCookies ? `--cookies "${COOKIES}"` : '';
  console.log('[COOKIES EXISTS]', hasCookies, COOKIES);

  // Use -f best to avoid any format-specific checks
  // --skip-download + --print-json is most reliable for metadata only
  const cmd = [
    'yt-dlp',
    cookieFlag,
    '--no-playlist',
    '--no-check-formats',
    '--no-check-certificates',
    '--extractor-args', '"youtube:skip=dash,hls"',
    '--skip-download',
    '--no-warnings',
    '-f', '"best[ext=mp4]/best"',
    '-j',
    `"${url}"`,
  ].filter(Boolean).join(' ');

  console.log('[INFO CMD]', cmd);

  exec(cmd, { timeout: 45000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
    if (err) {
      const msg = (stderr || err.message || '');
      console.error('[INFO ERROR]', msg);

      // Try fallback without format filter
      console.log('[RETRY] Trying without format filter...');
      const fallbackCmd = [
        'yt-dlp',
        cookieFlag,
        '--no-playlist',
        '--no-check-formats',
        '--no-check-certificates',
        '--no-warnings',
        '-j',
        `"${url}"`,
      ].filter(Boolean).join(' ');

      exec(fallbackCmd, { timeout: 45000, maxBuffer: 10 * 1024 * 1024 }, (err2, stdout2, stderr2) => {
        if (err2) {
          const msg2 = (stderr2 || err2.message || '');
          console.error('[FALLBACK ERROR]', msg2);
          if (msg2.includes('Private'))     return res.status(403).json({ error: 'This video is private.' });
          if (msg2.includes('unavailable')) return res.status(404).json({ error: 'Video unavailable.' });
          return res.status(500).json({ error: 'Failed: ' + msg2.substring(0, 300) });
        }
        parseAndRespond(stdout2, res);
      });
      return;
    }
    parseAndRespond(stdout, res);
  });
});

function parseAndRespond(stdout, res) {
  try {
    const info = JSON.parse(stdout.trim());

    const QUALITIES = ['144p','240p','360p','480p','720p','1080p','1440p','2160p'];
    const seen = new Set();
    const videoFormats = [];

    for (const fmt of (info.formats || [])) {
      if (!fmt.height || !fmt.vcodec || fmt.vcodec === 'none') continue;
      const q = `${fmt.height}p`;
      if (!QUALITIES.includes(q) || seen.has(q)) continue;
      seen.add(q);
      videoFormats.push({
        quality : q,
        itag    : fmt.format_id,
        hasAudio: fmt.acodec !== 'none',
        hasVideo: true,
      });
    }

    // If no formats parsed, add a generic "best" option
    if (videoFormats.length === 0) {
      videoFormats.push({ quality: 'Best', itag: 'bestvideo', hasAudio: false, hasVideo: true });
    }

    videoFormats.sort((a,b) => parseInt(b.quality) - parseInt(a.quality));

    const thumbs = (info.thumbnails || []).filter(t => t.url);
    const thumbnail = thumbs.length
      ? thumbs.reduce((b,t) => (t.width||0)*(t.height||0) > (b.width||0)*(b.height||0) ? t : b, thumbs[0]).url
      : `https://i.ytimg.com/vi/${info.id}/maxresdefault.jpg`;

    res.json({
      videoId    : info.id,
      title      : info.title,
      channel    : info.uploader || info.channel || 'Unknown',
      duration   : fmtDuration(info.duration),
      durationSec: info.duration,
      views      : (info.view_count || 0).toLocaleString(),
      thumbnail,
      videoFormats,
      audioItag  : 'bestaudio',
    });

  } catch (parseErr) {
    console.error('[PARSE ERROR]', parseErr.message);
    res.status(500).json({ error: 'Failed to parse video data.' });
  }
}

module.exports = router;
