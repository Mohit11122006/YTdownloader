# ⚡ YTFlow — Premium YouTube Downloader

A fast, beautiful YouTube downloader with MP3 + MP4 support, album art embedding, and a glassmorphism dark UI.

---

## ✨ Features

| Feature | Details |
|---|---|
| 🎵 MP3 Download | 320kbps audio, ID3 metadata, thumbnail embedded as album art |
| 🎬 MP4 Download | Multiple qualities: 144p → 1080p |
| 🖼️ Album Art | Original YouTube thumbnail auto-embedded in every MP3 |
| 📝 Metadata | Title, artist, album auto-tagged in MP3 |
| 🕘 History | Last 12 downloads saved locally |
| 🌙 Dark/Light | Smooth theme toggle |
| 📱 Responsive | Mobile, tablet, and desktop ready |
| ⚡ Fast | Async streaming, no re-upload |

---

## 📋 Prerequisites

- **Node.js** ≥ 16
- **FFmpeg** — must be installed and in your PATH

### Install FFmpeg

**macOS (Homebrew):**
```bash
brew install ffmpeg
```

**Ubuntu / Debian:**
```bash
sudo apt update && sudo apt install ffmpeg -y
```

**Windows:**  
Download from https://ffmpeg.org/download.html and add to PATH.

Verify:
```bash
ffmpeg -version
```

---

## 🚀 Quick Start

### 1. Clone / download the project

```bash
git clone <your-repo-url>
cd ytdl
```

### 2. Install backend dependencies

```bash
cd backend
npm install
```

### 3. Start the server

```bash
npm start
```

Or for development with auto-restart:
```bash
npm run dev
```

### 4. Open the app

Visit: **http://localhost:3001**

The backend serves the frontend automatically from the `/frontend` folder.

---

## 📁 Project Structure

```
ytdl/
├── backend/
│   ├── server.js              # Express app entry point
│   ├── package.json
│   └── routes/
│       ├── info.js            # GET /api/info — fetch video metadata
│       └── download.js        # GET /api/download — stream MP3/MP4
│
└── frontend/
    ├── index.html             # Single page app
    ├── style.css              # Midnight studio dark theme
    └── app.js                 # Client-side logic
```

---

## 🔌 API Reference

### `GET /api/info`

Fetch video metadata.

| Param | Type | Description |
|---|---|---|
| `url` | string | YouTube URL |

**Response:**
```json
{
  "videoId": "dQw4w9WgXcQ",
  "title": "Video Title",
  "channel": "Channel Name",
  "duration": "3:33",
  "views": "1,234,567",
  "thumbnail": "https://...",
  "videoFormats": [
    { "quality": "1080p", "itag": 137, "hasAudio": false },
    { "quality": "720p",  "itag": 136, "hasAudio": false },
    { "quality": "360p",  "itag": 18,  "hasAudio": true  }
  ],
  "audioItag": 140
}
```

---

### `GET /api/download`

Download video or audio.

| Param | Type | Description |
|---|---|---|
| `url` | string | YouTube URL |
| `type` | `mp3` or `mp4` | Format |
| `itag` | number | (MP4 only) format itag |
| `quality` | string | (MP4 only) quality label for filename |

---

## 🌐 Deployment

### Option 1: Render.com (Recommended — Free tier)

1. Push code to GitHub
2. Go to https://render.com → New Web Service
3. Connect your repo
4. Set:
   - **Build Command:** `cd backend && npm install`
   - **Start Command:** `cd backend && node server.js`
5. Add environment variable: `PORT=10000`
6. Add a **Build Pack** for FFmpeg or use a Docker deployment

**Dockerfile for Render (with FFmpeg):**

```dockerfile
FROM node:18-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --production
COPY backend/ ./
COPY frontend/ ../frontend/
EXPOSE 3001
CMD ["node", "server.js"]
```

### Option 2: Railway.app

1. Install Railway CLI: `npm i -g @railway/cli`
2. `railway login && railway init`
3. Add Dockerfile (above)
4. `railway up`

### Option 3: VPS (DigitalOcean / Linode)

```bash
# On your VPS
sudo apt install nodejs npm ffmpeg -y
git clone <your-repo>
cd ytdl/backend && npm install
# Use PM2 for process management
npm install -g pm2
pm2 start server.js --name ytflow
pm2 save && pm2 startup
```

---

## ⚙️ Environment Variables

Create `.env` in `/backend/` if needed:

```env
PORT=3001
```

---

## 🛡️ Legal Notice

This tool is for **personal use only**. Only download content you have the right to download. Respect YouTube's Terms of Service and copyright law. The authors are not responsible for misuse.

---

## 🐛 Troubleshooting

**"Could not fetch video info"**  
→ ytdl-core may need updating: `npm update @distube/ytdl-core`

**FFmpeg not found**  
→ Make sure `ffmpeg` is in your system PATH: `which ffmpeg`

**Video-only formats (no audio) produce silent MP4**  
→ The backend automatically merges audio. Ensure FFmpeg is installed.

**CORS errors in browser**  
→ Frontend must be served from the same origin as backend (already configured). Don't open `index.html` directly as a file.

---

Built with ❤️ using Node.js, Express, @distube/ytdl-core, FFmpeg, and vanilla JS.
