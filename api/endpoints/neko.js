'use strict';
const { httpGet } = require('../lib/httpGet');
module.exports = {
  name: 'Neko Image', method: 'GET', path: '/v1/neko', category: 'Image',
  description: 'Random neko image (nekos.best)',
  async execute() {
    const r = await httpGet('https://nekos.best/api/v2/neko');
    if (r.status !== 200 || !r.data.results) return { statusCode: 502, data: { status: false, error: 'Upstream failed' } };
    const row = r.data.results[0];
    return { status: true, result: { image: row.url, artist: row.artist_name, source: 'nekos.best' } };
  }
};
