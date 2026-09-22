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
  const maxRedirects = 5;

  function requestStream(url, redirectsLeft) {
    return new Promise((resolve, reject) => {
      let parsed;
      try { parsed = new URL(url); } catch { return reject(new Error('Invalid YouTube media tunnel URL.')); }

      const transport = parsed.protocol === 'https:' ? https : http;
      const req = transport.get(parsed, {
        headers: {
          accept: '*/*',
          'cache-control': 'no-cache',
          'user-agent': 'ZUKO-APPI/1.0'
        }
      }, (response) => {
        const status = response.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
          response.resume();
          if (redirectsLeft <= 0) return reject(new Error('Too many redirects while downloading YouTube media.'));
          const next = new URL(response.headers.location, parsed).toString();
          return requestStream(next, redirectsLeft - 1).then(resolve, reject);
        }
        if (status < 200 || status >= 300) {
          response.resume();
          return reject(new Error(`YouTube media download returned HTTP ${status}.`));
        }
        resolve(response);
      });

      req.setTimeout(TIMEOUT_MS, () => {
        req.destroy(new Error('YouTube media download timed out.'));
      });
      req.on('error', reject);
    });
  }

  const response = await requestStream(tunnelUrl, maxRedirects);
  const declared = Number(response.headers['content-length'] || 0);
  if (declared > MAX_FILE_BYTES) {
    response.destroy();
    throw new Error('Downloaded file exceeds the configured size limit.');
  }

  const contentType = String(response.headers['content-type'] || '').toLowerCase();
  if (contentType.includes('application/json') || contentType.includes('text/html')) {
    let body = '';
    for await (const chunk of response) {
      body += Buffer.from(chunk).toString('utf8');
      if (body.length > 8192) break;
    }
    throw new Error(`YouTube media tunnel returned an error response${body ? `: ${body.slice(0, 300)}` : '.'}`);
  }

  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(filepath, { flags: 'wx' });
    let size = 0;
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      out.destroy();
      response.destroy();
      reject(error);
    };

    response.on('data', chunk => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_FILE_BYTES) {
        fail(new Error('Downloaded file exceeds the configured size limit.'));
        return;
      }
      if (!out.write(chunk)) response.pause();
    });
    out.on('drain', () => response.resume());
    response.on('end', () => {
      if (settled) return;
      settled = true;
      out.end(() => resolve(size));
    });
    response.on('error', fail);
    out.on('error', fail);
  });

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
