'use strict';

const axios = require('axios');

const BASE_URL = String(process.env.YOUTUBETOOLKIT_BASE_URL || 'https://youtubetoolkit.com').replace(/\/$/, '');
const TOOL_PATH = String(process.env.YOUTUBETOOLKIT_TOOL_PATH || '/tools/video-downloader-1080p');
const TIMEOUT_MS = Number(process.env.YOUTUBETOOLKIT_TIMEOUT_MS || 45000);
const DEFAULT_API = String(process.env.YOUTUBETOOLKIT_DOWNLOAD_API || 'video_fast');

let session = null;
let sessionExpiresAt = 0;
let refreshPromise = null;

function validateYoutubeUrl(raw) {
  const value = String(raw || '').trim();
  if (!value || value.length > 4096) throw Object.assign(new Error('A valid YouTube URL is required.'), { statusCode: 400 });
  let u;
  try { u = new URL(value); } catch { throw Object.assign(new Error('Invalid YouTube URL.'), { statusCode: 400 }); }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) {
    throw Object.assign(new Error('Invalid YouTube URL.'), { statusCode: 400 });
  }
  const host = u.hostname.toLowerCase();
  if (!['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be','www.youtu.be'].includes(host)) {
    throw Object.assign(new Error('Only YouTube URLs are supported.'), { statusCode: 400 });
  }
  return u.toString();
}

function cookieHeader(setCookie = []) {
  return setCookie.map(v => String(v).split(';', 1)[0]).filter(Boolean).join('; ');
}

function extractCsrf(html) {
  const m = String(html || '').match(/"csrf"\s*:\s*"([^"]+)"/);
  if (!m) throw new Error('YouTubeToolkit CSRF token was not found.');
  return m[1];
}

async function createSession() {
  const r = await axios.get(`${BASE_URL}${TOOL_PATH}`, {
    timeout: TIMEOUT_MS,
    responseType: 'text',
    validateStatus: s => s >= 200 && s < 400,
    headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'ZUKO-APPI/1.0' }
  });
  const setCookie = r.headers['set-cookie'] || [];
  const cookies = cookieHeader(setCookie);
  const csrf = extractCsrf(r.data);
  session = { csrf, cookies };
  sessionExpiresAt = Date.now() + 90 * 60 * 1000;
  return session;
}

async function getSession(force = false) {
  if (!force && session && Date.now() < sessionExpiresAt) return session;
  if (!refreshPromise) refreshPromise = createSession().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

async function post(path, body, s) {
  return axios.post(`${BASE_URL}${path}`, body, {
    timeout: TIMEOUT_MS,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-CSRF-TOKEN': s.csrf,
      ...(s.cookies ? { Cookie: s.cookies } : {}),
      'User-Agent': 'ZUKO-APPI/1.0'
    },
    validateStatus: () => true
  });
}

async function resolve(rawUrl, mode) {
  const url = validateYoutubeUrl(rawUrl);
  let s = await getSession();

  let analyze = await post('/youtube-media-download/analyze', {
    url,
    download_api: DEFAULT_API
  }, s);

  if (analyze.status === 419) {
    s = await getSession(true);
    analyze = await post('/youtube-media-download/analyze', { url, download_api: DEFAULT_API }, s);
  }
  if (analyze.status < 200 || analyze.status >= 300 || !analyze.data?.success) {
    throw Object.assign(new Error(analyze.data?.error || `YouTubeToolkit analyze failed (HTTP ${analyze.status}).`), { statusCode: 502 });
  }

  const info = analyze.data.data || {};
  const title = String(info.title || 'youtube').slice(0, 180);
  const selectedMode = String(mode || info.default_mode || 'video:720');
  const allowed = [...(info.video_options || []), ...(info.audio_options || [])].map(x => String(x.mode || ''));
  if (!allowed.includes(selectedMode)) {
    throw Object.assign(new Error(`Unsupported YouTube quality/mode: ${selectedMode}`), { statusCode: 400 });
  }

  let resolveResponse = await post('/youtube-media-download/resolve', {
    video_id: info.video_id,
    download_mode: selectedMode,
    download_api: DEFAULT_API,
    title
  }, s);

  if (resolveResponse.status === 419) {
    s = await getSession(true);
    analyze = await post('/youtube-media-download/analyze', { url, download_api: DEFAULT_API }, s);
    if (analyze.status < 200 || analyze.status >= 300 || !analyze.data?.success) {
      throw Object.assign(new Error('YouTubeToolkit session refresh failed.'), { statusCode: 502 });
    }
    const refreshed = analyze.data.data || {};
    resolveResponse = await post('/youtube-media-download/resolve', {
      video_id: refreshed.video_id,
      download_mode: selectedMode,
      download_api: DEFAULT_API,
      title: String(refreshed.title || title).slice(0, 180)
    }, s);
  }

  if (resolveResponse.status < 200 || resolveResponse.status >= 300 || !resolveResponse.data?.success) {
    throw Object.assign(new Error(resolveResponse.data?.error || `YouTubeToolkit resolve failed (HTTP ${resolveResponse.status}).`), { statusCode: 502 });
  }

  const data = resolveResponse.data.data || {};
  if (!data.download_url) throw Object.assign(new Error('YouTubeToolkit returned no download URL.'), { statusCode: 502 });

  return {
    success: true,
    video_id: info.video_id,
    title,
    thumbnail: info.thumbnail || null,
    duration: info.duration || null,
    mode: selectedMode,
    mode_type: data.mode_type || (selectedMode.startsWith('audio:') ? 'audio' : 'video'),
    quality: data.mode_quality || selectedMode.split(':')[1] || null,
    provider: data.provider || null,
    download_url: data.download_url,
    file_name: data.file_name || title
  };
}

module.exports = { resolve, validateYoutubeUrl };
