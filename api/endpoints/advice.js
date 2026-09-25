'use strict';
const { httpGet } = require('../lib/httpGet');
module.exports = {
  name: 'Advice', method: 'GET', path: '/v1/advice', category: 'Fun',
  description: 'Random advice slip',
  async execute() {
    const r = await httpGet('https://api.adviceslip.com/advice');
    if (r.status !== 200) return { statusCode: 502, data: { status: false, error: 'Upstream failed' } };
    const slip = r.data.slip || r.data;
    return { status: true, result: { id: slip.id, advice: slip.advice, source: 'adviceslip' } };
  }
};
