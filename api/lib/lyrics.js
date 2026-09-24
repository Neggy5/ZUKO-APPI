'use strict';

/**
 * Lyrics client — LRCLIB (primary) + lyrics.ovh (fallback)
 * No API key required.
 *
 * LRCLIB:  https://lrclib.net/docs
 * ovh:     https://api.lyrics.ovh/v1/{artist}/{title}
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

const TIMEOUT = Number(process.env.LYRICS_TIMEOUT_MS || 15000);
const UA = process.env.LYRICS_USER_AGENT || 'ZUKO-API/1.0 (lyrics; +https://github.com/zuko)';

function request(urlStr, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'http:' ? 80 : 443),
        path: u.pathname + u.search,
        method,
        headers: {
          'User-Agent': UA,
          Accept: 'application/json',
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
      reject(new Error('Lyrics request timed out.'));
    });
    req.end();
  });
}

function stripLrcTimestamps(synced) {
  if (!synced) return '';
  return String(synced)
    .replace(/\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/g, '')
    .replace(/^\s+/gm, '')
    .trim();
}

/**
 * Search LRCLIB by free-text query
 */
async function lrclibSearch(q) {
  const url = `https://lrclib.net/api/search?q=${encodeURIComponent(q)}`;
  const r = await request(url);
  if (r.status !== 200 || !Array.isArray(r.data)) return [];
  return r.data;
}

/**
 * Exact get on LRCLIB
 */
async function lrclibGet({ artist, title, album, duration }) {
  const params = new URLSearchParams();
  if (title) params.set('track_name', title);
  if (artist) params.set('artist_name', artist);
  if (album) params.set('album_name', album);
  if (duration) params.set('duration', String(Math.round(Number(duration))));
  const r = await request(`https://lrclib.net/api/get?${params}`);
  if (r.status === 404) return null;
  if (r.status !== 200 || !r.data) return null;
  return r.data;
}

async function lyricsOvh(artist, title) {
  const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
  const r = await request(url);
  if (r.status !== 200 || !r.data?.lyrics) return null;
  return String(r.data.lyrics).trim();
}

function normalizeHit(hit, source) {
  if (!hit) return null;
  const plain =
    hit.plainLyrics ||
    hit.lyrics ||
    (hit.syncedLyrics ? stripLrcTimestamps(hit.syncedLyrics) : '') ||
    '';
  if (!plain && !hit.instrumental) return null;
  return {
    id: hit.id || null,
    title: hit.trackName || hit.name || hit.title || null,
    artist: hit.artistName || hit.artist || null,
    album: hit.albumName || hit.album || null,
    duration: hit.duration || null,
    instrumental: !!hit.instrumental,
    lyrics: plain || null,
    synced_lyrics: hit.syncedLyrics || null,
    source,
  };
}

/**
 * Resolve lyrics from a free-text query, or artist+title.
 *
 * @param {object} opts
 * @param {string} [opts.q] full query e.g. "faded alan walker"
 * @param {string} [opts.artist]
 * @param {string} [opts.title]
 * @param {string} [opts.album]
 * @param {number} [opts.duration]
 */
async function resolve(opts = {}) {
  let { q, artist, title, album, duration } = opts;
  q = String(q || '').trim();
  artist = String(artist || '').trim();
  title = String(title || '').trim();

  // Parse "Artist - Title" if only q given
  if (q && !title) {
    const m = q.match(/^(.+?)\s*[-–—]\s*(.+)$/);
    if (m) {
      artist = artist || m[1].trim();
      title = m[2].trim();
    } else {
      title = q;
    }
  }

  // 1) Exact LRCLIB get when we have title+artist
  if (title && artist) {
    try {
      const hit = await lrclibGet({ artist, title, album, duration });
      const norm = normalizeHit(hit, 'lrclib');
      if (norm && (norm.lyrics || norm.instrumental)) return norm;
    } catch (_) {}
  }

  // 2) LRCLIB search
  const searchQ = [artist, title].filter(Boolean).join(' ') || q;
  if (searchQ) {
    try {
      const results = await lrclibSearch(searchQ);
      for (const hit of results) {
        const norm = normalizeHit(hit, 'lrclib');
        if (norm && (norm.lyrics || norm.instrumental)) return norm;
      }
      // search hits may lack plainLyrics — fetch by id via get with names
      if (results[0]) {
        const top = results[0];
        try {
          const full = await lrclibGet({
            artist: top.artistName,
            title: top.trackName || top.name,
            album: top.albumName,
            duration: top.duration,
          });
          const norm = normalizeHit(full || top, 'lrclib');
          if (norm && (norm.lyrics || norm.instrumental)) return norm;
        } catch (_) {}
      }
    } catch (_) {}
  }

  // 3) lyrics.ovh fallback
  if (artist && title) {
    try {
      const text = await lyricsOvh(artist, title);
      if (text) {
        return {
          id: null,
          title,
          artist,
          album: album || null,
          duration: duration || null,
          instrumental: false,
          lyrics: text,
          synced_lyrics: null,
          source: 'lyrics.ovh',
        };
      }
    } catch (_) {}
  }

  return null;
}

module.exports = { resolve, lrclibSearch, lrclibGet, lyricsOvh };
