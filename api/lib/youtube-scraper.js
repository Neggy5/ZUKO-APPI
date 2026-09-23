'use strict';

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

const SCRAPER_URL = String(process.env.YOUTUBE_SCRAPER_URL || 'https://ahm7xmakki.com/api/alldl').trim().replace(/\/$/, '');
const MAX_FILE_BYTES = Number(process.env.YOUTUBE_SCRAPER_MAX_FILE_BYTES || 100 * 1024 * 1024);
const TIMEOUT_MS = Number(process.env.YOUTUBE_SCRAPER_TIMEOUT_MS || 120000);

function cleanFilename(name, fallback) {
  const value = String(name || fallback).replace(/[\\/:*?"<>|\r\n]+/g, '_').trim();
  return value.slice(0, 180) || fallback;
}

function validateYoutubeUrl(raw) {
  const value = String(raw || '').trim();
  if (!value || value.length > 4096) throw new Error('A valid YouTube URL is required.');
  let u;
  try { u = new URL(value); } catch { throw new Error('Invalid YouTube URL.'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only HTTP and HTTPS URLs are supported.');
  if (u.username || u.password) throw new Error('Credential-bearing URLs are not allowed.');
  const host = u.hostname.toLowerCase();
  if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be'].includes(host)) {
    throw new Error('Only YouTube URLs are supported by this endpoint.');
  }
  return u.toString();
}

async function resolveMedia(url) {
  let response;
  try {
    response = await axios.get(SCRAPER_URL, {
      params: { url },
      timeout: TIMEOUT_MS,
      headers: { Accept: 'application/json', 'User-Agent': 'ZUKO-APPI/1.2' },
      validateStatus: () => true
    });
  } catch (e) {
    throw new Error(`YouTube downloader request failed: ${e.message}`);
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`YouTube downloader returned HTTP ${response.status}.`);
  }
  const data = response.data;
  if (!data || data.success !== true) {
    const msg = data?.error?.message || data?.error || data?.message || 'Downloader could not resolve this YouTube URL.';
    throw new Error(String(msg));
  }
  const info = data.mediaInfo || data.data || data;
  const videoUrl = info.videoUrl || info.video_url || data.videoUrl;
  const audioUrl = info.audioUrl || info.audio_url || data.audioUrl;
  const title = info.title || data.title || 'youtube';
  const qualities = Array.isArray(info.qualities) ? info.qualities : [];
  if (!videoUrl && !audioUrl) throw new Error('Downloader returned no media URL.');
  return { videoUrl, audioUrl, title, qualities };
}

async function streamToFile(mediaUrl, filepath) {
  let response;
  try {
    response = await axios.get(mediaUrl, {
      responseType: 'stream',
      maxRedirects: 5,
      timeout: TIMEOUT_MS,
      decompress: false,
      validateStatus: () => true,
      headers: {
        Accept: '*/*',
        'Accept-Encoding': 'identity',
        'User-Agent': 'ZUKO-APPI/1.2'
      }
    });
  } catch (e) {
    throw new Error(`Media download request failed: ${e.message}`);
  }
  if (response.status < 200 || response.status >= 300) {
    response.data?.destroy?.();
    throw new Error(`Media download returned HTTP ${response.status}.`);
  }

  const declared = Number(response.headers?.['content-length'] || 0);
  if (declared > MAX_FILE_BYTES) {
    response.data.destroy();
    throw new Error('Downloaded file exceeds the configured size limit.');
  }

  const out = require('fs').createWriteStream(filepath, { flags: 'wx' });
  let size = 0;
  response.data.on('data', chunk => {
    size += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
    if (size > MAX_FILE_BYTES) response.data.destroy(new Error('Downloaded file exceeds the configured size limit.'));
  });

  await new Promise((resolve, reject) => {
    out.on('finish', resolve);
    out.on('error', reject);
    response.data.on('error', reject);
    response.data.pipe(out);
  }).catch(async e => {
    try { out.destroy(); } catch {}
    try { await fs.rm(filepath, { force: true }); } catch {}
    throw new Error(`Media stream failed: ${e.message}`);
  });

  const stat = await fs.stat(filepath);
  if (!stat.size) throw new Error('Downloader returned a zero-byte file.');
  return stat.size;
}

async function download(rawUrl, type, quality) {
  const youtubeUrl = validateYoutubeUrl(rawUrl);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zuko-youtube-'));
  const ext = type === 'audio' ? '.mp3' : '.mp4';
  const fallback = `youtube-${crypto.randomBytes(6).toString('hex')}${ext}`;

  try {
    const resolved = await resolveMedia(youtubeUrl);
    let mediaUrl = type === 'audio' ? resolved.audioUrl : resolved.videoUrl;

    // Prefer the requested quality when the provider exposes quality variants.
    if (type === 'video' && quality && Array.isArray(resolved.qualities)) {
      const wanted = String(quality).replace(/p$/i, '');
      const match = resolved.qualities.find(q =>
        String(q?.quality || q?.height || q?.label || '').replace(/p$/i, '') === wanted &&
        (q?.url || q?.videoUrl)
      );
      if (match) mediaUrl = match.url || match.videoUrl;
    }

    if (!mediaUrl) throw new Error(type === 'audio'
      ? 'Downloader did not provide an MP3 audio URL.'
      : 'Downloader did not provide an MP4 video URL.');

    const filename = cleanFilename(resolved.title, fallback).replace(/\.[^.]+$/, '') + ext;
    const filepath = path.join(dir, filename);
    const size = await streamToFile(mediaUrl, filepath);

    return {
      dir, filepath, filename, size,
      cleanup: () => fs.rm(dir, { recursive: true, force: true })
    };
  } catch (e) {
    await fs.rm(dir, { recursive: true, force: true });
    throw e;
  }
}

module.exports = { download, MAX_FILE_BYTES };
