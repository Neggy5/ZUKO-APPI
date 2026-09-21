'use strict';
const { inspect } = require('../../lib/ytdlp');
module.exports = {
  name: 'Media Info', method: 'GET', path: '/v1/download/info', category: 'Download',
  description: 'Inspect a public media URL and return normalized metadata.',
  async execute({ query }) {
    if (!query.url) return { statusCode: 400, data: { status:false, error:'url is required' } };
    return { status:true, result: await inspect(query.url, 'info') };
  }
};
