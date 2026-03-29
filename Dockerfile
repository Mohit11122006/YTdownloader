# ── YTFlow Docker Image ──────────────────────────
# Includes: Node.js 18, FFmpeg, all dependencies
# Usage:
#   docker build -t ytflow .
#   docker run -p 3001:3001 ytflow

FROM node:18-alpine

# Install FFmpeg (required for audio conversion + video merging)
RUN apk add --no-cache ffmpeg python3 make g++

# Set working directory
WORKDIR /app

# Copy and install backend dependencies first (layer caching)
COPY backend/package*.json ./
RUN npm install --production

# Copy backend source
COPY backend/ ./

# Copy frontend (served statically by Express)
COPY frontend/ ../frontend/

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

# Start
CMD ["node", "server.js"]
