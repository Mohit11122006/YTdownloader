# ── YTFlow Docker Image (flat repo structure) ─────
FROM node:18-alpine

# Install FFmpeg
RUN apk add --no-cache ffmpeg python3 make g++

# Set working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package.json ./
RUN npm install --production

# Copy all backend JS files
COPY server.js ./
COPY info.js ./routes/info.js
COPY download.js ./routes/download.js

# Copy frontend files into /frontend
COPY index.html /frontend/index.html
COPY style.css /frontend/style.css
COPY app.js /frontend/app.js

# Expose port
EXPOSE 10000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s \
  CMD wget -qO- http://localhost:10000/api/health || exit 1

# Start
CMD ["node", "server.js"]
