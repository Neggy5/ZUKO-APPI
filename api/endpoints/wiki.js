'use strict';
const { httpGet } = require('../lib/httpGet');
module.exports = {
  name: 'Wikipedia Summary', method: 'GET', path: '/v1/wiki', category: 'Info',
  description: 'Wikipedia page summary',
  async execute({ query }) {
    const q = String(query.q || query.title || 'Nigeria').trim();
    const r = await httpGet(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}`);
    if (r.status !== 200) return { statusCode: 404, data: { status: false, error: 'Page not found' } };
    return { status: true, result: {
      title: r.data.title, description: r.data.description, extract: r.data.extract,
      thumbnail: r.data.thumbnail?.source || null, url: r.data.content_urls?.desktop?.page || null, source: 'wikipedia'
    }};
  }
};
