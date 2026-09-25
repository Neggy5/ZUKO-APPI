'use strict';
const { httpGet } = require('../lib/httpGet');
module.exports = {
  name: 'Random Dog', method: 'GET', path: '/v1/dog', category: 'Image',
  description: 'Random dog image',
  async execute() {
    const r = await httpGet('https://dog.ceo/api/breeds/image/random');
    if (r.status !== 200) return { statusCode: 502, data: { status: false, error: 'Upstream failed' } };
    return { status: true, result: { image: r.data.message, source: 'dog.ceo' } };
  }
};
