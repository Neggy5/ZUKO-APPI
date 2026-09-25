'use strict';
const { httpGet } = require('../lib/httpGet');
module.exports = {
  name: 'Random Quote', method: 'GET', path: '/v1/quote', category: 'Fun',
  description: 'Random inspirational quote (zenquotes)',
  async execute() {
    const r = await httpGet('https://zenquotes.io/api/random');
    if (r.status !== 200) return { statusCode: 502, data: { status: false, error: 'Upstream failed' } };
    const row = Array.isArray(r.data) ? r.data[0] : r.data;
    return { status: true, result: { quote: row.q || row.quote, author: row.a || row.author, source: 'zenquotes' } };
  }
};
