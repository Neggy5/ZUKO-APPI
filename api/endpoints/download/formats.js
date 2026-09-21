'use strict';
const { inspect } = require('../../lib/ytdlp');
module.exports = {
  name: 'Media Formats', method: 'GET', path: '/v1/download/formats', category: 'Download',
  description: 'List available media formats for a public URL.',
  async execute({ query }) {
    if (!query.url) return { statusCode: 400, data: { status:false, error:'url is required' } };
    return { status:true, result: await inspect(query.url, 'formats') };
  }
};
