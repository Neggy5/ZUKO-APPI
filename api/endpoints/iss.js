'use strict';
const { httpGet } = require('../lib/httpGet');
module.exports = {
  name: 'ISS Location', method: 'GET', path: '/v1/iss', category: 'Science',
  description: 'Current ISS coordinates',
  async execute() {
    const r = await httpGet('http://api.open-notify.org/iss-now.json');
    if (r.status !== 200) return { statusCode: 502, data: { status: false, error: 'Upstream failed' } };
    const p = r.data.iss_position || {};
    return { status: true, result: { latitude: p.latitude, longitude: p.longitude, timestamp: r.data.timestamp, source: 'open-notify' } };
  }
};
