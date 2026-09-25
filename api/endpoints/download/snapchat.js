'use strict';

/**
 * Snapchat Downloader
 * Primary: StoryGrab (public stories/spotlights)
 * Fallback: yt-dlp social engine when StoryGrab has no media
 */

const storygrab = require('../../lib/storygrab');

let ytdlpSocial = null;
try {
  ytdlpSocial = require('./social');
} catch (_) {}

module.exports = {
  name: 'Snapchat Downloader',
  method: 'GET',
  path: '/v1/download/snapchat',
  category: 'Download',
  description:
    'Download public Snapchat stories / spotlights / profile media. Primary StoryGrab; fallback yt-dlp.',

  async execute({ query, req, res, ctx }) {
    const input = String(query.url || query.username || query.user || query.link || '').trim();
    if (!input) {
      return {
        statusCode: 400,
        data: { status: false, error: 'url or username is required' },
      };
    }

    const errors = [];

    try {
      const result = await storygrab.resolve(input);
      if (!result.empty && result.medias && result.medias.length) {
        return {
          status: true,
          success: true,
          platform: 'snapchat',
          result: {
            title: result.title,
            query: result.query,
            download_url: result.download_url,
            url: result.download_url,
            medias: result.medias,
            source: 'storygrab',
          },
        };
      }
      errors.push('storygrab: no public media');
    } catch (e) {
      errors.push(`storygrab: ${e.message}`);
    }

    // yt-dlp fallback only for full URLs
    if (ytdlpSocial && /^https?:\/\//i.test(input)) {
      try {
        return await ytdlpSocial.execute({
          query: { ...query, url: input, type: 'video' },
          req,
          res,
          ctx,
        });
      } catch (e) {
        errors.push(`yt-dlp: ${e.message}`);
      }
    }

    return {
      statusCode: 404,
      data: {
        status: false,
        error: 'No public Snapchat media found for this profile/URL.',
        tried: errors,
        source: 'snapchat',
      },
    };
  },
};
