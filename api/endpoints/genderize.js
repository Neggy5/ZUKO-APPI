'use strict';
const { httpGet } = require('../lib/httpGet');
module.exports = {
  name: 'Genderize', method: 'GET', path: '/v1/genderize', category: 'Tools',
  description: 'Predict gender from a name',
  async execute({ query }) {
    const name = String(query.name || query.q || '').trim();
    if (!name) return { statusCode: 400, data: { status: false, error: 'name is required' } };
    const r = await httpGet(`https://api.genderize.io?name=${encodeURIComponent(name)}`);
    if (r.status !== 200) return { statusCode: 502, data: { status: false, error: 'Upstream failed' } };
    return { status: true, result: { name: r.data.name, gender: r.data.gender, probability: r.data.probability, source: 'genderize' } };
  }
};
