'use strict';

/**
 * SaveFromIns / VidsSave-family Instagram (and multi) parser
 * POST https://api.savefromins.com/api/contentsite_api/media/parse
 *
 * Note: may return analyze_risk from some datacenter IPs.
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

const AUTH = process.env.SAVEFROMINS_AUTH || '20250901majwlqo';
const DOMAIN = process.env.SAVEFROMINS_DOMAIN || 'api-ak.savefromins.com';
const API = process.env.SAVEFROMINS_API || 'https://api.savefromins.com/api/contentsite_api/media/parse';
const TIMEOUT = Number(process.env.SAVEFROMINS_TIMEOUT_MS || 25000);

function request(method, urlStr, { body, headers } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'http:' ? http : https;
    const payload = body != null ? body : null;
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || undefined,
        path: u.pathname + u.search,
        method,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'application/json, text/plain, */*',
          Origin: 'https://savefromins.com',
          Referer: 'https://savefromins.com/',
          ...(payload
            ? {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Content-Length': Buffer.byteLength(payload),
              }
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
          resolve({ status: res.statusCode, data });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('SaveFromIns request timed out.'));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function formBody(obj) {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v ?? ''))}`)
    .join('&');
}

/**
 * Parse an Instagram (or supported) URL.
 * @returns {{ title, thumbnail, duration, medias: Array<{type,quality,format,url,size}> }}
 */
async function parse(link) {
  const body = formBody({
    auth: AUTH,
    domain: DOMAIN,
    origin: 'source',
    link: String(link).trim(),
  });

  const r = await request('POST', API, { body });
  if (r.status !== 200) {
    throw Object.assign(new Error(`SaveFromIns HTTP ${r.status}`), { statusCode: r.status });
  }

  // Success shapes:
  //  { status: 1, data: { title, resources: [...] } }
  //  { data: { title, resources: [...] } }  // some clients/proxies
  const root = r.data;
  if (!root || typeof root !== 'object') {
    throw Object.assign(new Error('SaveFromIns empty response'), { statusCode: 502 });
  }
  if (root.status === 0 || root.status_code === 'analyze_risk') {
    const code = root.status_code || 'unknown';
    const msg = root.msg || 'SaveFromIns analyze failed';
    const err = new Error(`${msg} (${code})`);
    err.code = code;
    err.statusCode = code === 'analyze_risk' ? 503 : 502;
    throw err;
  }
  const d = root.data || (root.resources ? root : null);
  if (!d || (!d.resources && !d.medias)) {
    const code = root.status_code || 'unknown';
    const msg = root.msg || 'SaveFromIns analyze failed';
    const err = new Error(`${msg} (${code})`);
    err.code = code;
    err.statusCode = code === 'analyze_risk' ? 503 : 502;
    throw err;
  }
  const medias = [];
  for (const res of d.resources || []) {
    const url = res.download_url || res.preview_url;
    if (!url) continue;
    medias.push({
      type: res.type || (String(res.format || '').includes('mp4') ? 'video' : 'image'),
      quality: res.quality || null,
      format: res.format || null,
      url,
      size: res.size || null,
    });
  }

  // Some responses nest media under items[]
  if (!medias.length && Array.isArray(d.medias)) {
    for (const m of d.medias) {
      const url = m.download_url || m.url;
      if (url) medias.push({ type: m.type || 'video', quality: m.quality, format: m.format, url, size: m.size });
    }
  }

  if (!medias.length) {
    throw Object.assign(new Error('SaveFromIns returned no media URLs.'), { statusCode: 502 });
  }

  return {
    title: d.title || null,
    thumbnail: d.thumbnail || medias[0]?.url || null,
    duration: d.duration || null,
    medias,
    source: 'savefromins',
  };
}

/** Best video URL (prefer highest quality video) */
function pickVideo(result) {
  const videos = (result.medias || []).filter((m) => /video|mp4/i.test(String(m.type) + String(m.format)));
  if (videos.length) return videos[0].url;
  return result.medias[0]?.url || null;
}

module.exports = { parse, pickVideo };
