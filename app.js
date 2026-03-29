/**
 * ╔═══════════════════════════════════════════════╗
 * ║     YTFlow — Frontend App Logic               ║
 * ║     Handles: fetch, display, download,        ║
 * ║              history, theme, background        ║
 * ╚═══════════════════════════════════════════════╝
 */

/* ── Config ──────────────────────────────────────── */
const API_BASE    = window.location.origin;   // same origin (backend serves frontend)
const HISTORY_KEY = 'ytflow_history';

/* ── DOM refs ────────────────────────────────────── */
const urlInput       = document.getElementById('urlInput');
const fetchBtn       = document.getElementById('fetchBtn');
const pasteBtn       = document.getElementById('pasteBtn');
const searchCard     = document.getElementById('searchCard');
const loaderSection  = document.getElementById('loaderSection');
const errorSection   = document.getElementById('errorSection');
const resultSection  = document.getElementById('resultSection');
const errorMsg       = document.getElementById('errorMsg');
const retryBtn       = document.getElementById('retryBtn');
const newSearchBtn   = document.getElementById('newSearchBtn');
const themeToggle    = document.getElementById('themeToggle');
const themeIcon      = document.getElementById('themeIcon');
const loaderText     = document.getElementById('loaderText');
const step1          = document.getElementById('step1');
const step2          = document.getElementById('step2');
const step3          = document.getElementById('step3');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

// Result fields
const videoThumb    = document.getElementById('videoThumb');
const videoDuration = document.getElementById('videoDuration');
const videoTitle    = document.getElementById('videoTitle');
const videoChannel  = document.getElementById('videoChannel');
const videoViews    = document.getElementById('videoViews');
const qualityGrid   = document.getElementById('qualityGrid');
const dlMp3Btn      = document.getElementById('dlMp3Btn');
const progressWrap  = document.getElementById('progressWrap');
const progressFill  = document.getElementById('progressFill');
const progressLabel = document.getElementById('progressLabel');
const historyGrid   = document.getElementById('historyGrid');
const historyEmpty  = document.getElementById('historyEmpty');

/* ── State ───────────────────────────────────────── */
let currentVideo = null;
let isDark = true;

/* ══════════════════════════════════════════════════
   BACKGROUND CANVAS — animated particle grid
══════════════════════════════════════════════════ */
(function initCanvas() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  const ctx    = canvas.getContext('2d');
  let W, H, particles = [];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  class Particle {
    constructor() { this.reset(); }
    reset() {
      this.x    = Math.random() * W;
      this.y    = Math.random() * H;
      this.r    = Math.random() * 1.5 + 0.4;
      this.vx   = (Math.random() - 0.5) * 0.3;
      this.vy   = (Math.random() - 0.5) * 0.3;
      this.life = Math.random();
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.life += 0.003;
      if (this.x < 0 || this.x > W || this.y < 0 || this.y > H) this.reset();
    }
    draw() {
      const alpha = Math.sin(this.life * Math.PI) * 0.5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 212, 255, ${alpha})`;
      ctx.fill();
    }
  }

  // Create 80 particles
  for (let i = 0; i < 80; i++) particles.push(new Particle());

  function connectParticles() {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 100) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(0,212,255,${(1 - dist/100) * 0.07})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
  }

  function animate() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => { p.update(); p.draw(); });
    connectParticles();
    requestAnimationFrame(animate);
  }
  animate();
})();

/* ══════════════════════════════════════════════════
   THEME TOGGLE
══════════════════════════════════════════════════ */
function initTheme() {
  const saved = localStorage.getItem('ytflow_theme');
  isDark = saved !== 'light';
  applyTheme();
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  themeIcon.textContent = isDark ? '☀️' : '🌙';
}

themeToggle.addEventListener('click', () => {
  isDark = !isDark;
  applyTheme();
  localStorage.setItem('ytflow_theme', isDark ? 'dark' : 'light');
});

/* ══════════════════════════════════════════════════
   UI STATE HELPERS
══════════════════════════════════════════════════ */
function showSection(name) {
  loaderSection.classList.add('hidden');
  errorSection.classList.add('hidden');
  resultSection.classList.add('hidden');
  if (name === 'loader') loaderSection.classList.remove('hidden');
  if (name === 'error')  errorSection.classList.remove('hidden');
  if (name === 'result') resultSection.classList.remove('hidden');
}

function showError(msg) {
  errorMsg.textContent = msg;
  showSection('error');
}

/* ── Loader step animations ─────────────────────── */
function animateLoader() {
  const steps = [
    { el: step1, delay: 0,    text: 'Connecting to YouTube…' },
    { el: step2, delay: 1200, text: 'Analyzing formats…' },
    { el: step3, delay: 2200, text: 'Almost ready…' },
  ];
  steps.forEach(({ el, delay, text }) => {
    setTimeout(() => {
      [step1,step2,step3].forEach(s => s.classList.remove('active'));
      el.classList.add('active');
      loaderText.textContent = text;
    }, delay);
  });
}

/* ══════════════════════════════════════════════════
   FETCH VIDEO INFO
══════════════════════════════════════════════════ */
async function fetchVideoInfo(url) {
  fetchBtn.disabled = true;
  showSection('loader');
  animateLoader();

  try {
    const res  = await fetch(`${API_BASE}/api/info?url=${encodeURIComponent(url)}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Could not fetch video.');

    currentVideo = { ...data, url };
    renderResult(data);
    addToHistory(data, url);

  } catch (err) {
    showError(err.message || 'Network error. Make sure the backend is running.');
  } finally {
    fetchBtn.disabled = false;
    [step1,step2,step3].forEach(s => s.classList.remove('active','done'));
  }
}

/* ══════════════════════════════════════════════════
   RENDER RESULT
══════════════════════════════════════════════════ */
function renderResult(data) {
  // Video info
  videoThumb.src        = data.thumbnail;
  videoThumb.alt        = data.title;
  videoDuration.textContent = data.duration;
  videoTitle.textContent    = data.title;
  videoChannel.textContent  = data.channel;
  videoViews.textContent    = data.views ? `${data.views} views` : '';

  // Quality buttons
  qualityGrid.innerHTML = '';
  if (!data.videoFormats || data.videoFormats.length === 0) {
    qualityGrid.innerHTML = '<p style="font-size:.8rem;color:var(--text-muted)">No video formats found.</p>';
  } else {
    data.videoFormats.forEach(fmt => {
      const btn = document.createElement('button');
      btn.className = 'quality-btn';

      const q    = parseInt(fmt.quality);
      let badge  = 'sd', badgeText = 'SD';
      if (q >= 1080) { badge = 'fhd'; badgeText = 'FHD'; }
      else if (q >= 720) { badge = 'hd'; badgeText = 'HD'; }
      else if (q >= 480) { badge = 'sd'; badgeText = 'SD'; }

      btn.innerHTML = `
        <span class="q-label">${fmt.quality}</span>
        <span class="q-badge ${badge}">${badgeText}</span>
        <span style="flex:1"></span>
        <span class="q-dl-icon">↓</span>
      `;
      btn.addEventListener('click', () => triggerDownload('mp4', fmt));
      qualityGrid.appendChild(btn);
    });
  }

  // MP3 button
  dlMp3Btn.onclick = () => triggerDownload('mp3');

  showSection('result');
  resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ══════════════════════════════════════════════════
   TRIGGER DOWNLOAD
══════════════════════════════════════════════════ */
function triggerDownload(type, fmt = null) {
  if (!currentVideo) return;

  const url   = currentVideo.url;
  let dlUrl   = `${API_BASE}/api/download?url=${encodeURIComponent(url)}&type=${type}`;
  let label   = type === 'mp3' ? 'Downloading MP3…' : `Downloading ${fmt?.quality || ''}…`;

  if (type === 'mp4' && fmt) {
    dlUrl += `&itag=${fmt.itag}&quality=${encodeURIComponent(fmt.quality)}`;
  }

  // Show progress indicator (simulated — actual byte progress would need streaming fetch)
  showProgress(label);

  // Trigger browser download via hidden <a>
  const a = document.createElement('a');
  a.href        = dlUrl;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // Remove after short delay
  setTimeout(() => {
    document.body.removeChild(a);
    hideProgress();
  }, 4000);
}

function showProgress(label) {
  progressWrap.classList.remove('hidden');
  progressLabel.textContent = label;
  progressFill.style.width  = '0%';
  // Animate indeterminate-style fill
  let pct = 0;
  const interval = setInterval(() => {
    if (pct < 85) {
      pct += Math.random() * 8;
      progressFill.style.width = Math.min(pct, 85) + '%';
    } else {
      clearInterval(interval);
    }
  }, 300);
  progressFill._interval = interval;
}

function hideProgress() {
  clearInterval(progressFill._interval);
  progressFill.style.width = '100%';
  setTimeout(() => {
    progressWrap.classList.add('hidden');
    progressFill.style.width = '0%';
  }, 800);
}

/* ══════════════════════════════════════════════════
   HISTORY
══════════════════════════════════════════════════ */
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
}

function saveHistory(items) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
}

function addToHistory(data, url) {
  const items = loadHistory();
  // Remove duplicate if same videoId
  const filtered = items.filter(i => i.videoId !== data.videoId);
  filtered.unshift({ ...data, url, savedAt: Date.now() });
  // Keep last 12
  saveHistory(filtered.slice(0, 12));
  renderHistory();
}

function renderHistory() {
  const items = loadHistory();
  historyGrid.innerHTML = '';

  if (items.length === 0) {
    historyGrid.appendChild(historyEmpty);
    historyEmpty.classList.remove('hidden');
    clearHistoryBtn.classList.add('hidden');
    return;
  }

  clearHistoryBtn.classList.remove('hidden');

  items.forEach((item, i) => {
    const card = document.createElement('div');
    card.className = 'history-item';
    card.style.animationDelay = `${i * 0.06}s`;

    const img = document.createElement('img');
    img.className   = 'history-thumb';
    img.src         = item.thumbnail;
    img.alt         = item.title;
    img.loading     = 'lazy';

    const info = document.createElement('div');
    info.className  = 'history-info';
    info.innerHTML  = `
      <div class="history-title">${escapeHtml(item.title)}</div>
      <div class="history-meta">${escapeHtml(item.channel)} · ${item.duration}</div>
    `;

    card.appendChild(img);
    card.appendChild(info);

    // Click to load this video again
    card.addEventListener('click', () => {
      urlInput.value = item.url;
      fetchVideoInfo(item.url);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    historyGrid.appendChild(card);
  });
}

clearHistoryBtn.addEventListener('click', () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

/* ══════════════════════════════════════════════════
   INPUT HANDLING
══════════════════════════════════════════════════ */

/** Validate a YouTube URL (basic) */
function isValidYouTubeUrl(url) {
  return /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/)|youtu\.be\/)/.test(url);
}

fetchBtn.addEventListener('click', () => {
  const url = urlInput.value.trim();
  if (!url) {
    urlInput.focus();
    urlInput.classList.add('shake');
    setTimeout(() => urlInput.classList.remove('shake'), 600);
    return;
  }
  if (!isValidYouTubeUrl(url)) {
    showSection('error');
    showError('Please enter a valid YouTube URL (youtube.com or youtu.be).');
    return;
  }
  fetchVideoInfo(url);
});

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') fetchBtn.click();
});

// Auto-detect paste
urlInput.addEventListener('paste', (e) => {
  setTimeout(() => {
    const val = urlInput.value.trim();
    if (isValidYouTubeUrl(val)) {
      fetchBtn.click();
    }
  }, 50);
});

// Paste from clipboard button
pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    urlInput.value = text.trim();
    if (isValidYouTubeUrl(text.trim())) {
      setTimeout(() => fetchBtn.click(), 200);
    }
  } catch {
    urlInput.focus();
  }
});

retryBtn.addEventListener('click', () => {
  showSection(null);
  errorSection.classList.add('hidden');
  urlInput.focus();
});

newSearchBtn.addEventListener('click', () => {
  showSection(null);
  resultSection.classList.add('hidden');
  urlInput.value = '';
  urlInput.focus();
  currentVideo = null;
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* ── Shake animation (CSS injected) ─────────────── */
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
  @keyframes shake {
    0%,100% { transform: translateX(0); }
    20% { transform: translateX(-6px); }
    40% { transform: translateX(6px); }
    60% { transform: translateX(-4px); }
    80% { transform: translateX(4px); }
  }
  .shake { animation: shake 0.5s ease; }
`;
document.head.appendChild(shakeStyle);

/* ══════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════ */
initTheme();
renderHistory();
urlInput.focus();

// Staggered feature card entrance on scroll
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.animation = 'fadeInUp 0.5s ease both';
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.feature-card').forEach((el, i) => {
    el.style.opacity = '0';
    el.style.animationDelay = `${i * 0.08}s`;
    observer.observe(el);
  });
}
