'use strict';

const { URL } = require('url');
const https = require('https');
const http = require('http');
const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (_) {}
const savetube = require('../lib/savetube');

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
  name: 'YouTube MP4',
  method: 'GET',
  path: '/v1/ytmp4',
  category: 'Download',
  description: 'YouTube → MP4 via Save-Tube.',

  async execute({ query, res }) {
    const url = String(query.url || '').trim();
    if (!url) return { statusCode: 400, data: { status: false, error: 'url is required' } };

    const quality = query.quality || query.q || '360';
    const wantStream = String(query.stream || '') === '1' || String(query.mode || '') === 'stream';

    try {
      // Save-Tube is the canonical video provider for ZUKO.
      // Do not invoke yt-dlp for this endpoint unless explicitly enabled as a fallback.
      const result = await savetube.resolve(url, 'video', quality);

      if (!result || !result.download_url || !/^https?:\/\//i.test(result.download_url)) {
        throw new Error('Save-Tube returned an invalid video download URL.');
      }

      if (wantStream && res) {
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${(result.title || 'video').replace(/[^\w. -]/g, '_').slice(0, 80)}.mp4"`
        );
        res.setHeader('X-ZUKO-Source', 'savetube');
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
          source: 'savetube',
        },
      };
    } catch (err) {
      const statusCode = Number(err?.statusCode) || 502;
      console.error('[ytmp4] Save-Tube failed:', err?.stack || err?.message || err);
      return {
        statusCode,
        data: {
          status: false,
          error: err?.message || 'Save-Tube video download failed.',
          source: 'zuko',
          resolver: 'savetube',
          retryable: statusCode >= 500 || statusCode === 429,
        },
      };
    }
  },
};
