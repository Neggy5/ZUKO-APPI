'use strict';
const { httpGet } = require('../lib/httpGet');
module.exports = {
  name: 'Random Cat', method: 'GET', path: '/v1/cat', category: 'Image',
  description: 'Random cat image',
  async execute() {
    const r = await httpGet('https://api.thecatapi.com/v1/images/search');
    if (r.status !== 200 || !Array.isArray(r.data) || !r.data[0]) return { statusCode: 502, data: { status: false, error: 'Upstream failed' } };
    return { status: true, result: { image: r.data[0].url, id: r.data[0].id, source: 'thecatapi' } };
  }
};
