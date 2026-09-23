'use strict';
const { inspect } = require('../../lib/ytdlp');
const { detectPlatform, normalizeUrl } = require('../../lib/social');

module.exports = {
  name: 'Social Media Info',
  method: 'GET',
  path: '/v1/download/social/info',
  category: 'Download',
  description: 'Inspect a public social-media URL and return normalized metadata.',
  async execute({ query }) {
    if (!query.url) return { statusCode: 400, data: { status:false, error:'url is required' } };
    const url = normalizeUrl(query.url);
    const platform = detectPlatform(url);
    const result = await inspect(url, 'info');
    return { status:true, platform, result };
  }
};
