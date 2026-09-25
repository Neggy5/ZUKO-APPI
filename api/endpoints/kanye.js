'use strict';
const { httpGet } = require('../lib/httpGet');
module.exports = {
  name: 'Kanye Quote', method: 'GET', path: '/v1/kanye', category: 'Fun',
  description: 'Random Kanye West quote',
  async execute() {
    const r = await httpGet('https://api.kanye.rest/');
    if (r.status !== 200) return { statusCode: 502, data: { status: false, error: 'Upstream failed' } };
    return { status: true, result: { quote: r.data.quote, source: 'kanye.rest' } };
  }
};
