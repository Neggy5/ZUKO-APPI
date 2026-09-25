'use strict';
const { httpGet } = require('../lib/httpGet');
module.exports = {
  name: 'Astronauts in Space', method: 'GET', path: '/v1/astronauts', category: 'Science',
  description: 'People currently in space',
  async execute() {
    const r = await httpGet('http://api.open-notify.org/astros.json');
    if (r.status !== 200) return { statusCode: 502, data: { status: false, error: 'Upstream failed' } };
    return { status: true, result: { number: r.data.number, people: r.data.people, source: 'open-notify' } };
  }
};
