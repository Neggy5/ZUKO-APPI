'use strict';

/**
 * TwitterDown client — https://twitterdown.com/
 *
 * Flow:
 *  1) POST /api/twitter { url } → page token
 *  2) GET  /download-result?token=… (RSC) → quality list + per-quality tokens
 *  3) POST /api/twitter/get-download-details { token, original_url, username, status_id }
 *     → videoUrl / directDownloadUrl / edgeDownloadUrl
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

const BASE = process.env.TWITTERDOWN_BASE || 'https://twitterdown.com';
const TIMEOUT = Number(process.env.TWITTERDOWN_TIMEOUT_MS || 35000);
const UA =
  process.env.TWITTERDOWN_UA ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function request(method, urlStr, { body, headers, timeout = TIMEOUT } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'http:' ? http : https;
    const payload =
      body == null ? null : typeof body === 'string' ? body : JSON.stringify(body);
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || undefined,
        path: u.pathname + u.search,
        method,
        headers: {
          'User-Agent': UA,
          Accept: 'application/json, text/html, */*',
          Origin: BASE,
          Referer: BASE + '/',
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
            : {}),
          ...headers,
        },
        timeout,
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
          resolve({ status: res.statusCode, data, raw, headers: res.headers });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('TwitterDown request timed out.'));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function parseTweetId(url) {
  const s = String(url || '').trim();
  const m = s.match(/(?:twitter\.com|x\.com)\/([^/]+)\/status\/(\d+)/i);
  if (!m) return null;
  return { username: m[1], statusId: m[2], originalUrl: `https://x.com/${m[1]}/status/${m[2]}` };
}

function preferredOrder(qualities, want) {
  const q = String(want || '720').toLowerCase();
  const order = [];
  if (q.includes('1080') || q === 'hd' || q === 'best') order.push('1080p', '720p', '480p', '360p', '180p');
  else if (q.includes('720')) order.push('720p', '480p', '360p', '1080p', '180p');
  else if (q.includes('480')) order.push('480p', '360p', '720p', '180p');
  else if (q.includes('360')) order.push('360p', '480p', '180p', '720p');
  else if (q.includes('180') || q.includes('144') || q === 'worst') order.push('180p', '360p', '480p', '720p');
  else order.push('720p', '360p', '480p', '1080p', '180p');
  const sorted = [...qualities].sort((a, b) => {
    const ia = order.indexOf(a.resolution);
    const ib = order.indexOf(b.resolution);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return sorted;
}

async function parsePageToken(tweetUrl) {
  const r = await request('POST', `${BASE}/api/twitter`, {
    body: { url: tweetUrl },
    headers: { Referer: BASE + '/' },
  });
  if (r.status !== 200 || !r.data || r.data.code !== 0 || !r.data.data?.token) {
    const msg = r.data?.message || `TwitterDown parse failed (${r.status})`;
    const err = new Error(msg);
    err.statusCode = 502;
    throw err;
  }
  return r.data.data.token;
}

/**
 * Extract quality options from RSC / HTML of download-result page.
 */
async function listQualities(pageToken) {
  const r = await request('GET', `${BASE}/download-result?token=${encodeURIComponent(pageToken)}`, {
    headers: {
      RSC: '1',
      Accept: '*/*',
      Referer: BASE + '/',
    },
  });
  const text = typeof r.data === 'string' ? r.data : r.raw || '';
  const qualities = [];
  const re =
    /\{"resolution":"([^"]+)","quality":"([^"]+)","downloadUrl":"(\/api\/twitter\/get-download-details\?token=[^"]+)"\}/g;
  let m;
  while ((m = re.exec(text))) {
    const token = m[3].split('token=')[1];
    if (!token) continue;
    qualities.push({
      resolution: m[1],
      quality: m[2],
      token,
    });
  }
  // username / statusId from page if present
  const um = text.match(/"username":"([^"]+)"/);
  const sm = text.match(/"statusId":"([^"]+)"/);
  return {
    qualities,
    username: um ? um[1] : null,
    statusId: sm ? sm[1] : null,
  };
}

async function resolveQuality(qToken, meta) {
  const body = {
    token: qToken,
    original_url: meta.originalUrl,
    username: meta.username,
    status_id: meta.statusId,
  };
  const r = await request('POST', `${BASE}/api/twitter/get-download-details`, {
    body,
    headers: {
      Referer: `${BASE}/download-result`,
    },
  });
  if (r.status !== 200 || !r.data || r.data.code !== 0 || !r.data.data) {
    const msg = r.data?.message || `TwitterDown details failed (${r.status})`;
    const err = new Error(msg);
    err.statusCode = 502;
    throw err;
  }
  const d = r.data.data;
  const download_url =
    d.edgeDownloadUrl || d.directDownloadUrl || d.videoUrl || null;
  if (!download_url) {
    throw Object.assign(new Error('TwitterDown returned no download URL.'), { statusCode: 502 });
  }
  return {
    download_url,
    video_url: d.videoUrl || null,
    direct_url: d.directDownloadUrl || null,
    edge_url: d.edgeDownloadUrl || null,
    filename: d.filename || null,
  };
}

/**
 * Full resolve: tweet URL → best (or requested) MP4 link.
 */
async function resolve(tweetUrl, quality = '720') {
  const meta = parseTweetId(tweetUrl);
  if (!meta) {
    throw Object.assign(new Error('Invalid Twitter/X status URL.'), { statusCode: 400 });
  }

  const pageToken = await parsePageToken(meta.originalUrl);
  const listed = await listQualities(pageToken);
  if (!listed.qualities.length) {
    throw Object.assign(new Error('TwitterDown: no video qualities found.'), { statusCode: 502 });
  }

  const username = listed.username || meta.username;
  const statusId = listed.statusId || meta.statusId;
  const originalUrl = `https://x.com/${username}/status/${statusId}`;

  const ordered = preferredOrder(listed.qualities, quality);
  let lastErr;
  for (const q of ordered) {
    try {
      const file = await resolveQuality(q.token, {
        username,
        statusId,
        originalUrl,
      });
      return {
        title: `Twitter @${username}`,
        username,
        status_id: statusId,
        resolution: q.resolution,
        quality: q.quality,
        format: 'mp4',
        download_url: file.download_url,
        video_url: file.video_url,
        filename: file.filename,
        source: 'twitterdown',
        qualities: listed.qualities.map((x) => ({
          resolution: x.resolution,
          quality: x.quality,
        })),
      };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('TwitterDown: all qualities failed.');
}

module.exports = {
  resolve,
  parseTweetId,
  parsePageToken,
  listQualities,
  resolveQuality,
};
