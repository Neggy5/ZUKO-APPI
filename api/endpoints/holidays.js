'use strict';
const { httpGet } = require('../lib/httpGet');
module.exports = {
  name: 'Public Holidays', method: 'GET', path: '/v1/holidays', category: 'Info',
  description: 'Public holidays by country code (Nager.Date)',
  async execute({ query }) {
    const year = String(query.year || new Date().getFullYear());
    const country = String(query.country || query.cc || 'NG').trim().toUpperCase();
    const r = await httpGet(`https://date.nager.at/api/v3/PublicHolidays/${encodeURIComponent(year)}/${encodeURIComponent(country)}`);
    if (r.status !== 200) return { statusCode: 502, data: { status: false, error: 'Upstream failed' } };
    return { status: true, result: { year: Number(year), country, holidays: r.data, source: 'nager.date' } };
  }
};
