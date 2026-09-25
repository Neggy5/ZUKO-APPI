'use strict';
const { httpGet } = require('../lib/httpGet');
module.exports = {
  name: 'Cat Fact', method: 'GET', path: '/v1/catfact', category: 'Fun',
  description: 'Random cat fact',
  async execute() {
    const r = await httpGet('https://catfact.ninja/fact');
    if (r.status !== 200) return { statusCode: 502, data: { status: false, error: 'Upstream failed' } };
    return { status: true, result: { fact: r.data.fact, source: 'catfact.ninja' } };
  }
};
