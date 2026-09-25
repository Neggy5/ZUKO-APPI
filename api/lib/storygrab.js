'use strict';

/**
 * StoryGrab client — https://storygrab.io/
 * Snapchat stories / spotlights / public profiles
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

const BASE = process.env.STORYGRAB_BASE || 'https://storygrab.io';
const TIMEOUT = Number(process.env.STORYGRAB_TIMEOUT_MS || 30000);
const UA =
  process.env.STORYGRAB_UA ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function makeJar() {
  const map = new Map();
  return {
    store(setCookie) {
      if (!setCookie) return;
      const list = Array.isArray(setCookie) ? setCookie : [setCookie];
      for (const line of list) {
        const part = String(line).split(';')[0];
        const eq = part.indexOf('=');
        if (eq > 0) map.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
      }
    },
    header() {
      if (!map.size) return undefined;
      return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    },
  };
}

function request(method, urlStr, { body, headers, form, jar, timeout = TIMEOUT } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'http:' ? http : https;
    let payload = null;
    const hdrs = {
      'User-Agent': UA,
      Accept: 'application/json, text/html, */*',
      Origin: BASE,
      Referer: BASE + '/en1',
      ...headers,
    };
    const cookie = jar && jar.header();
    if (cookie) hdrs.Cookie = cookie;
    if (form) {
      payload = Object.entries(form)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v ?? ''))}`)
        .join('&');
      hdrs['Content-Type'] = 'application/x-www-form-urlencoded';
      hdrs['Content-Length'] = Buffer.byteLength(payload);
    } else if (body != null) {
      payload = typeof body === 'string' ? body : JSON.stringify(body);
      hdrs['Content-Type'] = 'application/json';
      hdrs['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || undefined,
        path: u.pathname + u.search,
        method,
        headers: hdrs,
        timeout,
      },
      (res) => {
        if (jar) jar.store(res.headers['set-cookie']);
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let data = raw;
          try {
            data = JSON.parse(raw);
          } catch (_) {}
          resolve({ status: res.statusCode, data, raw });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('StoryGrab request timed out.'));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function warmSession(jar) {
  await request('GET', `${BASE}/en1`, { jar, headers: { Accept: 'text/html' } });
}

async function getToken(jar) {
  const r = await request('GET', `${BASE}/get/token`, {
    jar,
    headers: {
      Accept: 'application/json',
      'X-StoryGrab-Token': '1',
    },
  });
  if (r.status !== 200 || !r.data?.success || !r.data?.token) {
    throw Object.assign(new Error(r.data?.message || 'StoryGrab token failed.'), {
      statusCode: 502,
    });
  }
  return r.data.token;
}

function normalizeQuery(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  return s.replace(/^@/, '');
}

function parseMedias(html) {
  const medias = [];
  if (!html) return { medias: [], renderApis: [] };

  const push = (url, type) => {
    if (!url || !/^https?:\/\//i.test(url)) return;
    medias.push({ type: type || (/mp4|m3u8/i.test(url) ? 'video' : 'media'), url });
  };

  let m;
  const hrefRe = /href=["'](https?:[^"']+)["']/gi;
  while ((m = hrefRe.exec(html))) {
    if (/\.(mp4|m3u8|jpg|jpeg|png|webp)/i.test(m[1]) || /snap|cdn|media/i.test(m[1])) {
      push(m[1]);
    }
  }

  const dataRe =
    /data-(?:profile-download|download|url|src|media)=["'](https?:[^"']+)["']/gi;
  while ((m = dataRe.exec(html))) push(m[1]);

  const jsonRe = /"download"\s*:\s*"(https?:[^"]+)"/gi;
  while ((m = jsonRe.exec(html))) push(m[1].replace(/\\u0026/g, '&'), 'video');

  const apiRe = /["'](\/get\/[^"']+)["']/gi;
  const renderApis = [];
  while ((m = apiRe.exec(html))) renderApis.push(BASE + m[1]);

  const seen = new Set();
  const unique = [];
  for (const item of medias) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    unique.push(item);
  }
  return { medias: unique, renderApis: [...new Set(renderApis)] };
}

function parseProfile(html) {
  const title =
    (html.match(/<h2[^>]*>([^<]+)<\/h2>/i) || [])[1] ||
    (html.match(/profile-username[^>]*>@?([^<]+)/i) || [])[1] ||
    null;
  const empty = /No media found/i.test(html);
  return { title: title ? title.trim() : null, empty };
}

async function resolveRenderApi(apiUrl, jar) {
  const r = await request('GET', apiUrl, {
    jar,
    headers: { Accept: 'application/json', 'X-StoryGrab-Token': '1' },
  });
  if (r.status === 200 && r.data?.success && r.data?.url) return r.data.url;
  return null;
}

async function resolve(query) {
  const q = normalizeQuery(query);
  if (!q) {
    throw Object.assign(new Error('url or username is required'), { statusCode: 400 });
  }

  const jar = makeJar();
  await warmSession(jar);
  const token = await getToken(jar);

  const r = await request('POST', `${BASE}/fetch`, {
    jar,
    form: {
      url: q,
      form_token: token,
      language: 'en',
    },
    headers: {
      'X-StoryGrab-Token': '1',
      Referer: BASE + '/en1',
    },
  });

  if (r.status !== 200 || !r.data) {
    throw Object.assign(new Error(`StoryGrab HTTP ${r.status}`), { statusCode: 502 });
  }

  if (r.data.error || r.data.success === false) {
    const err = new Error(r.data.message || r.data.error_code || 'StoryGrab fetch failed');
    err.code = r.data.error_code;
    err.statusCode = /private|invalid|unavailable/i.test(String(r.data.message || ''))
      ? 404
      : 502;
    throw err;
  }

  // Soft error messages sometimes still success:false
  if (typeof r.data.message === 'string' && /refresh and try again/i.test(r.data.message)) {
    throw Object.assign(new Error(r.data.message), { statusCode: 503, code: 'token_rejected' });
  }

  const html = r.data.html || '';
  const profile = parseProfile(html);
  const parsed = parseMedias(html);

  if (!parsed.medias.length && parsed.renderApis.length) {
    for (const api of parsed.renderApis.slice(0, 5)) {
      try {
        const url = await resolveRenderApi(api, jar);
        if (url) parsed.medias.push({ type: 'video', url });
      } catch (_) {}
    }
  }

  return {
    title: profile.title,
    query: q,
    empty: profile.empty && !parsed.medias.length,
    medias: parsed.medias,
    download_url:
      parsed.medias.find((m) => m.type === 'video')?.url || parsed.medias[0]?.url || null,
    source: 'storygrab',
  };
}

module.exports = { resolve, getToken, normalizeQuery, parseMedias };
