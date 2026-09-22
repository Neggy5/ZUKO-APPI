'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');

const SCRAPER_URL = String(process.env.YOUTUBE_SCRAPER_URL || '').trim().replace(/\/$/, '');
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

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  catch (e) { if (e.name === 'AbortError') throw new Error('YouTube scraper timed out.'); throw e; }
  finally { clearTimeout(timer); }
}

async function createJob(url, type, quality) {
  if (!SCRAPER_URL) throw new Error('YOUTUBE_SCRAPER_URL is not configured.');
  const body = type === 'audio'
    ? { url, downloadMode: 'audio', audioFormat: 'mp3', audioBitrate: '128', alwaysProxy: true }
    : { url, downloadMode: 'auto', videoQuality: /^\d{3,4}$/.test(String(quality || '')) ? String(quality) : '720', youtubeVideoCodec: 'h264', youtubeVideoContainer: 'mp4', alwaysProxy: true };

  const response = await fetchWithTimeout(SCRAPER_URL, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`YouTube scraper returned HTTP ${response.status}.`); }
  if (!response.ok || !data || !data.status) throw new Error(data?.error?.code || data?.error?.message || data?.error || `YouTube scraper returned HTTP ${response.status}.`);
  if (!['tunnel', 'redirect'].includes(data.status) || !data.url) throw new Error('YouTube scraper did not return a downloadable media URL.');
  return { url: data.url, filename: data.filename };
}

async function fetchTunnelToFile(tunnelUrl, filepath) {
  const axios = require('axios');
  const { pipeline } = require('stream/promises');

  let response;
  try {
    response = await axios.get(tunnelUrl, {
      responseType: 'stream',
      maxRedirects: 5,
      timeout: TIMEOUT_MS,
      decompress: false,
      validateStatus: () => true,
      headers: {
        Accept: '*/*',
        'Accept-Encoding': 'identity',
        'Cache-Control': 'no-cache',
        'User-Agent': 'ZUKO-APPI/1.1'
      }
    });
  } catch (error) {
    throw new Error(`YouTube media tunnel request failed: ${error.message}`);
  }

  const status = Number(response.status || 0);
  const contentType = String(response.headers?.['content-type'] || '').toLowerCase();
  if (status < 200 || status >= 300) {
    let body = '';
    try {
      response.data.setEncoding('utf8');
      for await (const chunk of response.data) {
        body += chunk;
        if (body.length >= 8192) break;
      }
    } catch {}
    throw new Error(`YouTube media tunnel returned HTTP ${status}${body ? `: ${body.slice(0, 300)}` : '.'}`);
  }

  const declared = Number(response.headers?.['content-length'] || 0);
  if (declared > MAX_FILE_BYTES) {
    response.data.destroy();
    throw new Error('Downloaded file exceeds the configured size limit.');
  }

  // Cobalt's /tunnel endpoint is a raw media stream. Never treat a successful
  // 200 tunnel response as JSON merely because an upstream proxy supplied a
  // generic content type. Validate the first bytes only when the content type
  // explicitly identifies JSON/HTML.
  if (contentType.includes('application/json') || contentType.includes('text/html')) {
    let body = '';
    try {
      response.data.setEncoding('utf8');
      for await (const chunk of response.data) {
        body += chunk;
        if (body.length >= 8192) break;
      }
    } catch {}
    throw new Error(`YouTube media tunnel returned an error response${body ? `: ${body.slice(0, 300)}` : '.'}`);
  }

  const out = require('fs').createWriteStream(filepath, { flags: 'wx' });
  let size = 0;
  response.data.on('data', (chunk) => {
    size += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
    if (size > MAX_FILE_BYTES) {
      response.data.destroy(new Error('Downloaded file exceeds the configured size limit.'));
    }
  });

  try {
    await pipeline(response.data, out);
  } catch (error) {
    try { out.destroy(); } catch {}
    try { await fsp.rm(filepath, { force: true }); } catch {}
    throw new Error(`YouTube media tunnel stream failed: ${error.message}`);
  }

  const stat = await fsp.stat(filepath);
  if (stat.size <= 0) throw new Error('YouTube media tunnel returned a zero-byte file.');
  return stat.size;
}

async function download(rawUrl, type, quality) {
  const youtubeUrl = validateYoutubeUrl(rawUrl);
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'zuko-youtube-'));
  const ext = type === 'audio' ? '.mp3' : '.mp4';
  const fallback = `youtube-${crypto.randomBytes(6).toString('hex')}${ext}`;

  try {
    // A Cobalt tunnel is a short-lived, one-time media URL. If the first tunnel
    // expires/is empty before ZUKO consumes it, request a fresh tunnel once.
    let lastError;
    for (let attempt = 1; attempt <= 2; attempt++) {
      let filepath;
      try {
        const job = await createJob(youtubeUrl, type, quality);
        const filename = cleanFilename(job.filename, fallback);
        const finalName = path.extname(filename).toLowerCase() === ext
          ? filename
          : `${filename.replace(/\.[^.]+$/, '')}${ext}`;
        filepath = path.join(dir, finalName);

        const size = await fetchTunnelToFile(job.url, filepath);
        return {
          dir,
          filepath,
          filename: finalName,
          size,
          cleanup: () => fsp.rm(dir, { recursive: true, force: true })
        };
      } catch (error) {
        lastError = error;
        if (filepath) {
          try { await fsp.rm(filepath, { force: true }); } catch {}
        }
        if (attempt < 2) continue;
      }
    }
    throw lastError || new Error('YouTube media download failed.');
  } catch (e) {
    await fsp.rm(dir, { recursive: true, force: true });
    throw e;
  }
}
module.exports = { download, MAX_FILE_BYTES };
