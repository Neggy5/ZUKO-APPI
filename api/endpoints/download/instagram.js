'use strict';

/**
 * Instagram Downloader
 * Primary: yt-dlp (existing social engine)
 * Fallback: SaveFromIns parse API → JSON download_url
 */

const { detectPlatform } = require('../../lib/social');
const savefromins = require('../../lib/savefromins');

let ytdlpSocial = null;
try {
  // Prefer full social streaming path when available
  ytdlpSocial = require('./social');
} catch (_) {}

module.exports = {
  name: 'Instagram Downloader',
  method: 'GET',
  path: '/v1/download/instagram',
  category: 'Download',
  description:
    'Download public Instagram media. Primary: yt-dlp. Fallback: SaveFromIns (JSON links).',

  async execute({ query, req, res, ctx }) {
    const u = String(query.url || query.link || '').trim();
    if (!u) {
      return { statusCode: 400, data: { status: false, error: 'url is required' } };
    }

    let platform;
    try {
      platform = detectPlatform(u);
    } catch (e) {
      return { statusCode: 400, data: { status: false, error: e.message } };
    }
    if (platform !== 'instagram') {
      return {
        statusCode: 400,
        data: { status: false, error: 'This endpoint only accepts Instagram URLs.' },
      };
    }

    const mode = String(query.type || query.format || 'json').toLowerCase();
    const wantStream = String(query.stream || '') === '1' || mode === 'video' || mode === 'audio';
    const errors = [];

    // 1) yt-dlp path (stream file) when stream/video/audio requested
    if (wantStream && ytdlpSocial && typeof ytdlpSocial.execute === 'function') {
      try {
        return await ytdlpSocial.execute({
          query: { ...query, url: u, type: mode === 'json' ? 'video' : mode },
          req,
          res,
          ctx,
        });
      } catch (e) {
        errors.push(`yt-dlp: ${e.message}`);
        // fall through to SaveFromIns JSON
      }
    }

    // 2) SaveFromIns fallback — always useful for bot JSON response
    try {
      const result = await savefromins.parse(u);
      const best = savefromins.pickVideo(result);
      return {
        status: true,
        success: true,
        platform: 'instagram',
        result: {
          title: result.title,
          thumbnail: result.thumbnail,
          duration: result.duration,
          download_url: best,
          url: best,
          medias: result.medias,
          source: result.source,
        },
        fallback_errors: errors.length ? errors : undefined,
      };
    } catch (e) {
      errors.push(`savefromins: ${e.message}`);
      return {
        statusCode: e.statusCode || 502,
        data: {
          status: false,
          error: e.message || 'Instagram download failed.',
          code: e.code || undefined,
          tried: errors,
          retryable: e.code === 'analyze_risk',
        },
      };
    }
  },
};
