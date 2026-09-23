'use strict';
const { inspect } = require('../../lib/ytdlp');
const { detectPlatform, normalizeUrl } = require('../../lib/social');

module.exports = {
  name: 'Snapchat Media Info',
  method: 'GET',
  path: '/v1/download/snapchat/info',
  category: 'Download',
  description: 'Return metadata and available formats for a public snapchat URL without downloading the file.',
  async execute({ query }) {
    if (!query.url) return { statusCode: 400, data: { status:false, error:'url is required' } };
    const url = normalizeUrl(query.url);
    const detected = detectPlatform(url);
    if (detected !== 'snapchat') return { statusCode: 400, data: { status:false, error:'A snapchat URL is required' } };
    return { status:true, platform:'snapchat', result: await inspect(url, 'info') };
  }
};
