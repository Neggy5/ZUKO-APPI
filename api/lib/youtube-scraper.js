'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

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

async function download(rawUrl, type, quality) {
  const youtubeUrl = validateYoutubeUrl(rawUrl);
  const job = await createJob(youtubeUrl, type, quality);
  const response = await fetchWithTimeout(job.url, { headers: { accept: '*/*' } });
  if (!response.ok || !response.body) throw new Error(`YouTube media download returned HTTP ${response.status}.`);

  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > MAX_FILE_BYTES) throw new Error('Downloaded file exceeds the configured size limit.');

  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'zuko-youtube-'));
  const ext = type === 'audio' ? '.mp3' : '.mp4';
  const fallback = type === 'audio' ? `youtube-${crypto.randomBytes(6).toString('hex')}.mp3` : `youtube-${crypto.randomBytes(6).toString('hex')}.mp4`;
  const filename = cleanFilename(job.filename, fallback);
  const finalName = path.extname(filename).toLowerCase() === ext ? filename : `${filename.replace(/\.[^.]+$/, '')}${ext}`;
  const filepath = path.join(dir, finalName);

  let size = 0;
  try {
    const out = fs.createWriteStream(filepath, { flags: 'wx' });
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_FILE_BYTES) {
          await reader.cancel();
          throw new Error('Downloaded file exceeds the configured size limit.');
        }
        if (!out.write(Buffer.from(value))) await new Promise(resolve => out.once('drain', resolve));
      }
      await new Promise((resolve, reject) => { out.end(err => err ? reject(err) : resolve()); });
    } catch (e) {
      out.destroy();
      throw e;
    }
    return { dir, filepath, filename: finalName, size, cleanup: () => fsp.rm(dir, { recursive: true, force: true }) };
  } catch (e) {
    await fsp.rm(dir, { recursive: true, force: true });
    throw e;
  }
}

module.exports = { download, MAX_FILE_BYTES };
