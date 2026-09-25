'use strict';
const { httpGet } = require('../lib/httpGet');
module.exports = {
  name: 'IP Lookup', method: 'GET', path: '/v1/ip', category: 'Tools',
  description: 'Public IP or lookup via ipapi.co',
  async execute({ query }) {
    const ip = String(query.ip || '').trim();
    const url = ip ? `https://ipapi.co/${encodeURIComponent(ip)}/json/` : 'https://ipapi.co/json/';
    const r = await httpGet(url);
    if (r.status !== 200 || r.data.error) return { statusCode: 502, data: { status: false, error: r.data?.reason || 'Upstream failed' } };
    return { status: true, result: {
      ip: r.data.ip, city: r.data.city, region: r.data.region, country: r.data.country_name,
      org: r.data.org, timezone: r.data.timezone, source: 'ipapi.co'
    }};
  }
};
