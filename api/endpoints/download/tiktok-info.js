'use strict';
const { inspect } = require('../../lib/ytdlp');
const { detectPlatform, normalizeUrl } = require('../../lib/social');

module.exports = {
  name: 'Tiktok Media Info',
  method: 'GET',
  path: '/v1/download/tiktok/info',
  category: 'Download',
  description: 'Return metadata and available formats for a public tiktok URL without downloading the file.',
  async execute({ query }) {
    if (!query.url) return { statusCode: 400, data: { status:false, error:'url is required' } };
    const url = normalizeUrl(query.url);
    const detected = detectPlatform(url);
    if (detected !== 'tiktok') return { statusCode: 400, data: { status:false, error:'A tiktok URL is required' } };
    return { status:true, platform:'tiktok', result: await inspect(url, 'info') };
  }
};
