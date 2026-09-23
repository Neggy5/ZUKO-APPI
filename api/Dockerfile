FROM node:22-bookworm-slim
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv ffmpeg ca-certificates git \
  && python3 -m venv /opt/yt-dlp-venv \
  && /opt/yt-dlp-venv/bin/pip install --no-cache-dir -U pip "yt-dlp[default]" "yt-dlp-ejs" "curl-cffi>=0.11" "bgutil-ytdlp-pot-provider" \
  && ln -s /opt/yt-dlp-venv/bin/yt-dlp /usr/local/bin/yt-dlp \
  && git clone --depth 1 --branch 2.0.0 https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git /opt/bgutil-ytdlp-pot-provider \
  && cd /opt/bgutil-ytdlp-pot-provider/server \
  && npm ci --no-audit --no-fund \
  && (test -x node_modules/.bin/tsc || npm install --no-save --no-package-lock typescript@5.9.3) \
  && node_modules/.bin/tsc \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . ./

ENV NODE_ENV=production
ENV YTDLP_MAX_FILE_BYTES=104857600
ENV YTDLP_IMPERSONATE=Chrome-131:Android-14
ENV YTDLP_JS_RUNTIMES=node
ENV YTDLP_POT_URL=http://127.0.0.1:4416

EXPOSE 3000
CMD ["/app/start.sh"]
