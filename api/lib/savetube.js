'use strict';

/**
 * Save-Tube client — always uses /download CDN URLs
 * (direct googlevideo links 403 from bot/datacenter IPs)
 */

const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const AES_KEY = Buffer.from('C5D58EF67A7584E4A29F6C35BBC4EB12', 'hex');
const CDN_API = 'https://media.savetube.vip/api/random-cdn';
const ORIGIN = 'https://save-tube.com';
const TIMEOUT = Number(process.env.SAVETUBE_TIMEOUT_MS || 45000);

function request(method, urlStr, { body, headers } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'http:' ? http : https;
    const payload = body != null ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'http:' ? 80 : 443),
        path: u.pathname + u.search,
        method,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'application/json, text/plain, */*',
          Origin: ORIGIN,
          Referer: ORIGIN + '/',
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {}),
          ...headers,
        },
        timeout: TIMEOUT,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let data = raw;
          try {
            data = JSON.parse(raw);
          } catch (_) {}
          resolve({ status: res.statusCode, data, headers: res.headers });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Save-Tube request timed out.'));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function decryptPayload(b64) {
  const raw = Buffer.from(String(b64 || ''), 'base64');
  if (raw.length < 32) throw new Error('Save-Tube: invalid encrypted payload.');
  const iv = raw.subarray(0, 16);
  const data = raw.subarray(16);
  const decipher = crypto.createDecipheriv('aes-128-cbc', AES_KEY, iv);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}

async function pickCdn() {
  const r = await request('GET', CDN_API);
  if (r.status !== 200 || !r.data?.cdn) {
    throw new Error(`Save-Tube CDN lookup failed (${r.status}).`);
  }
  return String(r.data.cdn).replace(/^https?:\/\//, '');
}

async function getInfo(youtubeUrl) {
  const cdn = await pickCdn();
  const r = await request('POST', `https://${cdn}/v2/info`, { body: { url: youtubeUrl } });
  if (r.status === 401 || r.status === 429) {
    throw Object.assign(new Error('Save-Tube rate limited. Try again shortly.'), { statusCode: 429 });
  }
  if (r.status !== 200 || !r.data) {
    throw new Error(`Save-Tube info failed (${r.status}).`);
  }
  if (r.data.status === false || r.data.error) {
    throw new Error(r.data.error || r.data.message || 'Save-Tube rejected the URL.');
  }
  const payload = typeof r.data.data === 'string' ? decryptPayload(r.data.data) : r.data.data;
  if (!payload || !payload.key) throw new Error('Save-Tube: missing key after decrypt.');
  return { cdn, info: payload };
}

async function getDownloadUrl(cdn, key, { type = 'audio', quality } = {}) {
  const isAudio = type === 'audio';
  const q = String(quality || (isAudio ? '128' : '360'));
  const r = await request('POST', `https://${cdn}/download`, {
    body: {
      downloadType: isAudio ? 'audio' : 'video',
      quality: q,
      key,
    },
  });
  if (r.status !== 200 || !r.data?.data?.downloadUrl) {
    throw new Error((r.data && r.data.message) || `Save-Tube download failed (${r.status}).`);
  }
  return r.data.data.downloadUrl;
}

/**
 * Always resolve via /download so URL is on *.savetube.vip CDN
 * (googlevideo direct links 403 from bot / cloud IPs)
 */
async function resolve(youtubeUrl, type = 'audio', quality) {
  const { cdn, info } = await getInfo(youtubeUrl);

  const preferred =
    type === 'audio'
      ? ['128', '320', '256', '192']
      : [String(quality || '360'), '240', '360', '144', '720', '1080'];

  let lastErr;
  const tried = new Set();
  for (const q of preferred) {
    if (tried.has(q)) continue;
    tried.add(q);
    try {
      const download_url = await getDownloadUrl(cdn, info.key, { type, quality: q });
      return {
        title: info.title || (type === 'audio' ? 'audio' : 'video'),
        thumbnail: info.thumbnail || null,
        duration: info.durationLabel || info.duration || null,
        quality: q,
        format: type === 'audio' ? 'mp3' : 'mp4',
        download_url,
        source: 'savetube',
      };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Save-Tube: no download URL for any quality.');
}

module.exports = { resolve, getInfo, getDownloadUrl, decryptPayload };
