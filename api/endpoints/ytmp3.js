'use strict';

const https = require('https');
const http = require('http');
const { URL } = require('url');
const savetube = require('../lib/savetube');

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
        timeout: 120000,
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
        res.setHeader('Content-Type', upstream.headers['content-type'] || 'audio/mpeg');
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

module.exports = {
  name: 'YouTube MP3',
  method: 'GET',
  path: '/v1/ytmp3',
  category: 'Download',
  description: 'YouTube → MP3 via Save-Tube (primary).',

  async execute({ query, res }) {
    const url = String(query.url || '').trim();
    if (!url) return { statusCode: 400, data: { status: false, error: 'url is required' } };

    const wantStream = String(query.stream || '') === '1' || String(query.mode || '') === 'stream';

    try {
      const result = await savetube.resolve(url, 'audio', query.quality || '128');

      if (wantStream && res) {
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${(result.title || 'audio').replace(/[^\w. -]/g, '_').slice(0, 80)}.mp3"`
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
          format: 'mp3',
          download_url: result.download_url,
          url: result.download_url,
          source: result.source,
        },
      };
    } catch (err) {
      if (process.env.SAVETUBE_FALLBACK_YTDLP === '1') {
        try {
          const { download } = require('../lib/ytdlp');
          const job = await download(url, 'audio');
          if (wantStream && res) {
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader(
              'Content-Disposition',
              `attachment; filename="${job.filename.replace(/[^\w. -]/g, '_')}"`
            );
            res.setHeader('Content-Length', String(job.size));
            res.setHeader('X-ZUKO-Source', 'ytdlp');
            res.on('finish', job.cleanup);
            res.on('close', job.cleanup);
            res.flushHeaders();
            require('fs').createReadStream(job.filepath).pipe(res);
            return null;
          }
          await job.cleanup();
        } catch (_) {}
      }

      return {
        statusCode: err.statusCode || 502,
        data: { status: false, error: err.message || 'YouTube MP3 failed.' },
      };
    }
  },
};
