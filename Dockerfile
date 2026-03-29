# ── YTFlow Docker Image ──────────────────────────
# Includes: Node.js 18, FFmpeg, all dependencies
# Usage:
#   docker build -t ytflow .
#   docker run -p 3001:3001 ytflow

FROM node:18-alpine

# Install FFmpeg (required for audio conversion + video merging)
RUN apk add --no-cache ffmpeg python3 make g++

# Copy frontend to /frontend (Express serves it from ../frontend relative to /app)
COPY frontend/ /frontend/

# Set working directory for backend
WORKDIR /app

# Copy and install backend dependencies first (layer caching)
COPY backend/package*.json ./
RUN npm install --production

# Copy backend source
COPY backend/ ./

# Expose port
EXPOSE 10000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

# Start
CMD ["node", "server.js"]
