'use strict';
const { inspect } = require('../../lib/ytdlp');
const { detectPlatform, normalizeUrl } = require('../../lib/social');

module.exports = {
  name: 'Twitter Media Info',
  method: 'GET',
  path: '/v1/download/twitter/info',
  category: 'Download',
  description: 'Return metadata and available formats for a public twitter URL without downloading the file.',
  async execute({ query }) {
    if (!query.url) return { statusCode: 400, data: { status:false, error:'url is required' } };
    const url = normalizeUrl(query.url);
    const detected = detectPlatform(url);
    if (detected !== 'twitter') return { statusCode: 400, data: { status:false, error:'A twitter URL is required' } };
    return { status:true, platform:'twitter', result: await inspect(url, 'info') };
  }
};
