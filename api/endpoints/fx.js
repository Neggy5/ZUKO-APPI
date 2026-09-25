'use strict';
const { httpGet } = require('../lib/httpGet');
module.exports = {
  name: 'Exchange Rates',
  method: 'GET',
  path: '/v1/fx',
  category: 'Finance',
  description: 'FX rates (open.er-api.com)',
  async execute({ query }) {
    const fr = String(query.from || 'USD').trim().toUpperCase();
    const r = await httpGet(`https://open.er-api.com/v6/latest/${encodeURIComponent(fr)}`);
    if (r.status !== 200 || r.data.result !== 'success') {
      return { statusCode: 502, data: { status: false, error: 'Upstream failed' } };
    }
    let rates = r.data.rates || {};
    const to = String(query.to || '').trim().toUpperCase();
    if (to) {
      const want = to.split(',').map((s) => s.trim()).filter(Boolean);
      const filtered = {};
      for (const c of want) if (rates[c] != null) filtered[c] = rates[c];
      rates = filtered;
    }
    return {
      status: true,
      result: {
        base: r.data.base_code,
        date: r.data.time_last_update_utc,
        rates,
        source: 'open.er-api.com',
      },
    };
  },
};
