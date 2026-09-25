'use strict';

const twitterdown = require('../../lib/twitterdown');

module.exports = {
  name: 'Twitter/X via TwitterDown',
  method: 'GET',
  path: '/v1/download/twitterdown',
  category: 'Download',
  description:
    'Download public Twitter/X videos via TwitterDown (JSON download_url). Query: url, quality (720|360|180|best).',

  async execute({ query }) {
    const url = String(query.url || query.link || '').trim();
    if (!url) {
      return { statusCode: 400, data: { status: false, error: 'url is required' } };
    }
    if (!/(?:twitter\.com|x\.com)\/.+\/status\/\d+/i.test(url)) {
      return {
        statusCode: 400,
        data: { status: false, error: 'A Twitter/X status URL is required.' },
      };
    }

    const quality = query.quality || query.q || '720';

    try {
      const result = await twitterdown.resolve(url, quality);
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
          source: 'twitterdown',
        },
      };
    } catch (e) {
      return {
        statusCode: e.statusCode || 502,
        data: {
          status: false,
          error: e.message || 'TwitterDown failed.',
          source: 'twitterdown',
        },
      };
    }
  },
};
