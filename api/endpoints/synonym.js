'use strict';
const { httpGet } = require('../lib/httpGet');
module.exports = {
  name: 'Synonyms', method: 'GET', path: '/v1/synonym', category: 'Tools',
  description: 'Word synonyms (Datamuse)',
  async execute({ query }) {
    const word = String(query.q || query.word || '').trim();
    if (!word) return { statusCode: 400, data: { status: false, error: 'q (word) is required' } };
    const r = await httpGet(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(word)}&max=15`);
    if (r.status !== 200) return { statusCode: 502, data: { status: false, error: 'Upstream failed' } };
    return { status: true, result: { word, synonyms: (r.data || []).map(x => x.word), source: 'datamuse' } };
  }
};
