'use strict';

const { URL } = require('url');
const https = require('https');
const http = require('http');
const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (_) {}
const { inspect } = require('../lib/ytdlp');
const savetube = require('../lib/savetube');

const YTDLP_DEADLINE_MS = Number(process.env.YT_VIDEO_YTDLP_INSPECT_TIMEOUT_MS || 20000);
const TOTAL_DEADLINE_MS = Number(process.env.YT_VIDEO_RESOLVER_TIMEOUT_MS || 24000);
const SAVE_TUBE_FALLBACK = String(process.env.SAVETUBE_VIDEO_FALLBACK || '0') === '1';

function withDeadline(promise, ms, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })])
    .finally(() => clearTimeout(timer));
}

function pickProgressiveMp4(formats, requestedQuality) {
  const maxHeight = Number(String(requestedQuality || '360').match(/^\d+$/)?.[0] || 360);
  const candidates = (formats || [])
    .filter(f => f && f.url && f.ext === 'mp4' && f.vcodec && f.vcodec !== 'none' && f.acodec && f.acodec !== 'none')
    .map(f => ({ ...f, height: Number(f.height || 0), tbr: Number(f.tbr || 0) }))
    .filter(f => f.height > 0 && f.height <= maxHeight)
    .sort((a,b) => b.height - a.height || b.tbr - a.tbr);
  return candidates[0] || null;
}

async function ytdlpResolve(url, quality) {
  const meta = await withDeadline(inspect(url, 'formats'), YTDLP_DEADLINE_MS, 'yt-dlp video resolver timed out.');
  const format = pickProgressiveMp4(meta.formats, quality);
  if (!format) throw new Error('yt-dlp found no compatible progressive MP4 format.');
  return { title: meta.title || 'video', thumbnail: meta.thumbnail || null, duration: meta.duration || null, quality: String(format.height), format: 'mp4', download_url: format.url, source: 'ytdlp' };
}

function pipeUrl(urlStr, res) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.get(urlStr, { family: 4, lookup: (host, opts, cb) => dns.lookup(host, { ...opts, family: 4, all: false }, cb), headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.youtube.com/' }, timeout: 15000 }, upstream => {
      if (upstream.statusCode >= 300 && upstream.statusCode < 400 && upstream.headers.location) { upstream.resume(); return pipeUrl(upstream.headers.location, res).then(resolve, reject); }
      if (upstream.statusCode < 200 || upstream.statusCode >= 400) { upstream.resume(); return reject(new Error(`Video upstream HTTP ${upstream.statusCode}`)); }
      res.setHeader('Content-Type', upstream.headers['content-type'] || 'video/mp4');
      if (upstream.headers['content-length']) res.setHeader('Content-Length', upstream.headers['content-length']);
      upstream.pipe(res); upstream.on('end', resolve); upstream.on('error', reject);
    });
    req.on('error', reject); req.on('timeout', () => { req.destroy(); reject(new Error('Video upstream connection timed out.')); });
  });
}

module.exports = {
  name: 'YouTube MP4', method: 'GET', path: '/v1/ytmp4', category: 'Download',
  description: 'YouTube → MP4 using yt-dlp with IPv4-first networking; optional Save-Tube fallback.',
  async execute({ query, res }) {
    const url = String(query.url || '').trim();
    if (!url) return { statusCode: 400, data: { status: false, error: 'url is required' } };
    const quality = query.quality || query.q || '360';
    const wantStream = String(query.stream || '') === '1' || String(query.mode || '') === 'stream';
    let result; let lastError;
    try {
      // yt-dlp is now the primary resolver. The previous Save-Tube-first path was
      // the source of the Cloudflare IPv4/IPv6 connection failures seen on Railway.
      result = await withDeadline(ytdlpResolve(url, quality), TOTAL_DEADLINE_MS, 'YouTube video resolver timed out.');
    } catch (err) {
      lastError = err;
      if (SAVE_TUBE_FALLBACK) {
        try { result = await withDeadline(savetube.resolve(url, 'video', quality), 7000, 'Save-Tube fallback timed out.'); }
        catch (fallbackErr) { lastError = fallbackErr; }
      }
    }
    if (!result) return { statusCode: 502, data: { status: false, error: lastError?.message || 'YouTube MP4 failed.', source: 'zuko', resolver: 'ytdlp', retryable: true } };
    if (wantStream && res) {
      res.setHeader('Content-Disposition', `attachment; filename="${(result.title || 'video').replace(/[^\w. -]/g, '_').slice(0,80)}.mp4"`);
      res.setHeader('X-ZUKO-Source', result.source || 'ytdlp'); res.flushHeaders(); await pipeUrl(result.download_url, res); return null;
    }
    return { status: true, success: true, result: { title: result.title, thumbnail: result.thumbnail, duration: result.duration, quality: result.quality, format: 'mp4', download_url: result.download_url, url: result.download_url, source: result.source } };
  }
};
