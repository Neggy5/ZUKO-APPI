'use strict';
const { inspect } = require('../../lib/ytdlp');
const { detectPlatform, normalizeUrl } = require('../../lib/social');

module.exports = {
  name: 'Instagram Media Info',
  method: 'GET',
  path: '/v1/download/instagram/info',
  category: 'Download',
  description: 'Return metadata and available formats for a public instagram URL without downloading the file.',
  async execute({ query }) {
    if (!query.url) return { statusCode: 400, data: { status:false, error:'url is required' } };
    const url = normalizeUrl(query.url);
    const detected = detectPlatform(url);
    if (detected !== 'instagram') return { statusCode: 400, data: { status:false, error:'A instagram URL is required' } };
    return { status:true, platform:'instagram', result: await inspect(url, 'info') };
  }
};
