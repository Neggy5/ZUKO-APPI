'use strict';
const { httpGet } = require('../lib/httpGet');
module.exports = {
  name: 'Bible Verse', method: 'GET', path: '/v1/bible', category: 'Info',
  description: 'Bible verse lookup e.g. john 3:16',
  async execute({ query }) {
    const ref = String(query.q || query.ref || query.verse || 'john 3:16').trim();
    const r = await httpGet(`https://bible-api.com/${encodeURIComponent(ref)}`);
    if (r.status !== 200 || r.data.error) return { statusCode: 404, data: { status: false, error: r.data?.error || 'Not found' } };
    return { status: true, result: {
      reference: r.data.reference, text: r.data.text, translation: r.data.translation_name, source: 'bible-api.com'
    }};
  }
};
