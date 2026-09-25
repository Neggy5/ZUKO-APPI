'use strict';

/**
 * Twitter/X Downloader
 * Primary: existing social/yt-dlp path when available
 * Fallback: TwitterDown JSON links
 */

const twitterdown = require('../../lib/twitterdown');

let ytdlpSocial = null;
try {
  ytdlpSocial = require('./social');
} catch (_) {}

module.exports = {
  name: 'Twitter/X Downloader',
  method: 'GET',
  path: '/v1/download/twitter',
  category: 'Download',
  description:
    'Download public Twitter/X video. Primary yt-dlp; fallback TwitterDown (JSON download_url).',

  async execute({ query, req, res, ctx }) {
    const url = String(query.url || query.link || '').trim();
    if (!url) {
      return { statusCode: 400, data: { status: false, error: 'url is required' } };
    }
    if (!/(?:twitter\.com|x\.com)\//i.test(url)) {
      return {
        statusCode: 400,
        data: { status: false, error: 'This endpoint only accepts Twitter/X URLs.' },
      };
    }

    const mode = String(query.type || query.format || 'json').toLowerCase();
    const wantStream =
      String(query.stream || '') === '1' || mode === 'video' || mode === 'audio';
    const errors = [];

    if (wantStream && ytdlpSocial && typeof ytdlpSocial.execute === 'function') {
      try {
        return await ytdlpSocial.execute({
          query: { ...query, url, type: mode === 'json' ? 'video' : mode },
          req,
          res,
          ctx,
        });
      } catch (e) {
        errors.push(`yt-dlp: ${e.message}`);
      }
    }

    try {
      const result = await twitterdown.resolve(url, query.quality || query.q || '720');
      return {
        status: true,
        success: true,
        platform: 'twitter',
        result: {
          title: result.title,
          username: result.username,
          status_id: result.status_id,
          resolution: result.resolution,
          quality: result.quality,
          format: 'mp4',
          download_url: result.download_url,
          url: result.download_url,
          video_url: result.video_url,
          filename: result.filename,
          qualities: result.qualities,
          source: result.source,
        },
        fallback_errors: errors.length ? errors : undefined,
      };
    } catch (e) {
      errors.push(`twitterdown: ${e.message}`);
      return {
        statusCode: e.statusCode || 502,
        data: {
          status: false,
          error: e.message || 'Twitter download failed.',
          tried: errors,
        },
      };
    }
  },
};
