'use strict';

const https = require('https');
const http = require('http');
const { URL } = require('url');
const savetube = require('../lib/savetube');

const PROVIDER_DEADLINE_MS = Number(process.env.YT_VIDEO_PROVIDER_TIMEOUT_MS || 20000);
const YTDLP_INSPECT_DEADLINE_MS = Number(process.env.YT_VIDEO_YTDLP_INSPECT_TIMEOUT_MS || 22000);
const RESOLVER_TOTAL_DEADLINE_MS = Number(process.env.YT_VIDEO_RESOLVER_TIMEOUT_MS || 25000);

function pipeUrl(urlStr, res, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.get(
      urlStr,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Referer: 'https://save-tube.com/',
          ...headers,
        },
        timeout: 180000,
      },
      (upstream) => {
        if (upstream.statusCode >= 300 && upstream.statusCode < 400 && upstream.headers.location) {
          upstream.resume();
          pipeUrl(upstream.headers.location, res, headers).then(resolve).catch(reject);
          return;
        }
        if (upstream.statusCode < 200 || upstream.statusCode >= 400) {
          upstream.resume();
          reject(new Error(`Upstream HTTP ${upstream.statusCode}`));
          return;
        }
        res.setHeader('Content-Type', upstream.headers['content-type'] || 'video/mp4');
        if (upstream.headers['content-length']) {
          res.setHeader('Content-Length', upstream.headers['content-length']);
        }
        upstream.pipe(res);
        upstream.on('end', resolve);
        upstream.on('error', reject);
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Upstream timeout'));
    });
  });
}

function withDeadline(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function pickProgressiveMp4(formats, requestedQuality) {
  const maxHeight = Number(String(requestedQuality || '360').match(/^\d+$/)?.[0] || 360);
  const candidates = (formats || [])
    .filter(f =>
      f &&
      f.url &&
      f.ext === 'mp4' &&
      f.vcodec && f.vcodec !== 'none' &&
      f.acodec && f.acodec !== 'none'
    )
    .map(f => ({ ...f, height: Number(f.height || 0), tbr: Number(f.tbr || 0) }))
    .filter(f => f.height > 0 && f.height <= maxHeight)
    .sort((a, b) => b.height - a.height || b.tbr - a.tbr);

  return candidates[0] || null;
}

async function ytdlpDirectFallback(url, quality) {
  const { inspect } = require('../lib/ytdlp');
  const meta = await withDeadline(
    inspect(url, 'formats'),
    YTDLP_INSPECT_DEADLINE_MS,
    'YouTube video resolver timed out.'
  );
  const format = pickProgressiveMp4(meta.formats, quality);
  if (!format) throw new Error('No compatible progressive MP4 format was available.');
  return {
    title: meta.title || 'video',
    thumbnail: meta.thumbnail || null,
    duration: meta.duration || null,
    quality: String(format.height),
    format: 'mp4',
    download_url: format.url,
    source: 'ytdlp',
  };
}

module.exports = {
  name: 'YouTube MP4',
  method: 'GET',
  path: '/v1/ytmp4',
  category: 'Download',
  description: 'YouTube → MP4 via Save-Tube with a bounded yt-dlp direct-URL fallback.',

  async execute({ query, res }) {
    const url = String(query.url || '').trim();
    if (!url) return { statusCode: 400, data: { status: false, error: 'url is required' } };

    const quality = query.quality || query.q || '360';
    const wantStream = String(query.stream || '') === '1' || String(query.mode || '') === 'stream';

    let result;
    let lastError;

    // Run the two resolvers concurrently. The previous implementation waited
    // for Save-Tube to time out and only then started yt-dlp, which could push
    // the request beyond Railway's proxy window and produce a 502.
    const attempts = [
      withDeadline(
        savetube.resolve(url, 'video', quality),
        PROVIDER_DEADLINE_MS,
        'Save-Tube video resolver timed out.'
      ),
    ];

    if (process.env.SAVETUBE_FALLBACK_YTDLP !== '0') {
      attempts.push(
        ytdlpDirectFallback(url, quality)
      );
    }

    try {
      result = await withDeadline(
        Promise.any(attempts),
        RESOLVER_TOTAL_DEADLINE_MS,
        'All YouTube video resolvers timed out.'
      );
    } catch (err) {
      lastError = err;
      if (err?.errors?.length) lastError = err.errors[err.errors.length - 1];
    }

    if (!result) {
      return {
        statusCode: lastError?.statusCode || 502,
        data: {
          status: false,
          error: lastError?.message || 'YouTube MP4 failed.',
          source: 'zuko',
          retryable: true,
        },
      };
    }

    if (wantStream && res) {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${(result.title || 'video').replace(/[^\w. -]/g, '_').slice(0, 80)}.mp4"`
      );
      res.setHeader('X-ZUKO-Source', result.source || 'savetube');
      res.flushHeaders();
      await pipeUrl(result.download_url, res);
      return null;
    }

    return {
      status: true,
      success: true,
      result: {
        title: result.title,
        thumbnail: result.thumbnail,
        duration: result.duration,
        quality: result.quality,
        format: 'mp4',
        download_url: result.download_url,
        url: result.download_url,
        source: result.source,
      },
    };
  },
};
