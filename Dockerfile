FROM node:18-alpine

# Install FFmpeg
RUN apk add --no-cache ffmpeg python3 make g++

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install --production

# Copy backend files
COPY server.js ./
COPY info.js ./routes/info.js
COPY download.js ./routes/download.js

# Copy cookies (critical for YouTube auth)
COPY cookies.json ./cookies.json

# Copy frontend
COPY index.html /frontend/index.html
COPY style.css /frontend/style.css
COPY app.js /frontend/app.js

EXPOSE 10000

CMD ["node", "server.js"]
