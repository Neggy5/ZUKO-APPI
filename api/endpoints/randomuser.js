'use strict';
const { httpGet } = require('../lib/httpGet');
module.exports = {
  name: 'Random User', method: 'GET', path: '/v1/randomuser', category: 'Fun',
  description: 'Random fake user profile',
  async execute({ query }) {
    const n = Math.min(Number(query.results || 1) || 1, 10);
    const r = await httpGet(`https://randomuser.me/api/?results=${n}`);
    if (r.status !== 200) return { statusCode: 502, data: { status: false, error: 'Upstream failed' } };
    const users = (r.data.results || []).map(u => ({
      name: `${u.name?.first || ''} ${u.name?.last || ''}`.trim(),
      email: u.email, gender: u.gender, country: u.location?.country, picture: u.picture?.large
    }));
    return { status: true, result: { users, source: 'randomuser.me' } };
  }
};
