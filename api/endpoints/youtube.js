'use strict';

const { resolve } = require('../lib/youtube-toolkit');

module.exports = {
  name: 'YouTube Resolver',
  method: 'GET',
  path: '/v1/youtube',
  category: 'Download',
  description: 'Resolve a public YouTube URL to a temporary media download URL using the configured YouTubeToolkit public flow.',
  async execute({ query }) {
    if (!query.url) return { statusCode: 400, data: { status: false, error: 'url is required' } };

    const type = String(query.type || 'video').toLowerCase();
    const quality = String(query.quality || (type === 'audio' || type === 'mp3' ? '128' : '720')).toLowerCase().replace(/[^0-9a-z]/g, '');
    const mode = (type === 'audio' || type === 'mp3') ? `audio:${quality}` : `video:${quality}`;

    try {
      const result = await resolve(query.url, mode);
      return { statusCode: 200, data: { status: true, result } };
    } catch (error) {
      return {
        statusCode: error.statusCode || 502,
        data: { status: false, error: error.message || 'YouTube resolver failed.' }
      };
    }
  }
};
