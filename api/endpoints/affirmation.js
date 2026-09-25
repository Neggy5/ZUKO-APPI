'use strict';
const { httpGet } = require('../lib/httpGet');
module.exports = {
  name: 'Affirmation', method: 'GET', path: '/v1/affirmation', category: 'Fun',
  description: 'Random affirmation',
  async execute() {
    const r = await httpGet('https://www.affirmations.dev/');
    if (r.status !== 200) return { statusCode: 502, data: { status: false, error: 'Upstream failed' } };
    return { status: true, result: { affirmation: r.data.affirmation, source: 'affirmations.dev' } };
  }
};
