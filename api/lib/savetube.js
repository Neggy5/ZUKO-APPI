'use strict';

/**
 * Save-Tube client (save-tube.com / savetube.vip)
 * random-cdn → POST /v2/info (AES-CBC) → decrypt → POST /download
 * Zero extra deps — uses Node crypto + https
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

async function resolve(youtubeUrl, type = 'audio', quality) {
  const { cdn, info } = await getInfo(youtubeUrl);

  if (type === 'video' && Array.isArray(info.video_formats)) {
    const want = quality ? Number(quality) : null;
    const withUrl = info.video_formats.filter((f) => f && f.url);
    const pick =
      (want && withUrl.find((f) => Number(f.quality) === want || Number(f.height) === want)) ||
      withUrl.find((f) => f.default_selected) ||
      withUrl.sort((a, b) => Number(b.quality || b.height || 0) - Number(a.quality || a.height || 0))[0];
    if (pick?.url) {
      return {
        title: info.title || 'video',
        thumbnail: info.thumbnail || null,
        duration: info.durationLabel || info.duration || null,
        quality: String(pick.quality || pick.height || quality || ''),
        format: 'mp4',
        download_url: pick.url,
        source: 'savetube-direct',
      };
    }
  }

  if (type === 'audio' && Array.isArray(info.audio_formats)) {
    const withUrl = info.audio_formats.filter((f) => f && f.url);
    if (withUrl[0]?.url) {
      return {
        title: info.title || 'audio',
        thumbnail: info.thumbnail || null,
        duration: info.durationLabel || info.duration || null,
        quality: String(withUrl[0].quality || '128'),
        format: 'mp3',
        download_url: withUrl[0].url,
        source: 'savetube-direct',
      };
    }
  }

  const download_url = await getDownloadUrl(cdn, info.key, { type, quality });
  return {
    title: info.title || (type === 'audio' ? 'audio' : 'video'),
    thumbnail: info.thumbnail || null,
    duration: info.durationLabel || info.duration || null,
    quality: String(quality || (type === 'audio' ? '128' : '360')),
    format: type === 'audio' ? 'mp3' : 'mp4',
    download_url,
    source: 'savetube',
  };
}

module.exports = { resolve, getInfo, getDownloadUrl, decryptPayload };
