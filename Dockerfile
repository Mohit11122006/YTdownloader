FROM node:18-alpine

RUN apk add --no-cache ffmpeg python3 py3-pip curl && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
         -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY server.js ./
COPY info.js ./routes/info.js
COPY download.js ./routes/download.js

# Copy cookies.txt directly (Netscape format — no conversion needed)
COPY cookies.txt ./cookies.txt

COPY index.html /frontend/index.html
COPY style.css  /frontend/style.css
COPY app.js     /frontend/app.js

EXPOSE 10000
CMD ["node", "server.js"]
