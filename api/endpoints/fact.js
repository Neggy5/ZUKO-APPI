'use strict';
const { httpGet } = require('../lib/httpGet');
module.exports = {
  name: 'Random Fact', method: 'GET', path: '/v1/fact', category: 'Fun',
  description: 'Random useless fact',
  async execute() {
    const r = await httpGet('https://uselessfacts.jsph.pl/api/v2/facts/random');
    if (r.status !== 200) return { statusCode: 502, data: { status: false, error: 'Upstream failed' } };
    return { status: true, result: { fact: r.data.text, source: 'uselessfacts' } };
  }
};
