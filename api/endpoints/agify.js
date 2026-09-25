'use strict';
const { httpGet } = require('../lib/httpGet');
module.exports = {
  name: 'Agify', method: 'GET', path: '/v1/agify', category: 'Tools',
  description: 'Predict age from a name',
  async execute({ query }) {
    const name = String(query.name || query.q || '').trim();
    if (!name) return { statusCode: 400, data: { status: false, error: 'name is required' } };
    const r = await httpGet(`https://api.agify.io?name=${encodeURIComponent(name)}`);
    if (r.status !== 200) return { statusCode: 502, data: { status: false, error: 'Upstream failed' } };
    return { status: true, result: { name: r.data.name, age: r.data.age, count: r.data.count, source: 'agify' } };
  }
};
