'use strict';
const { httpGet } = require('../lib/httpGet');
module.exports = {
  name: 'Crypto Price', method: 'GET', path: '/v1/crypto', category: 'Finance',
  description: 'Crypto prices (CoinGecko)',
  async execute({ query }) {
    const ids = String(query.ids || query.coins || 'bitcoin,ethereum').trim();
    const vs = String(query.vs || 'usd').trim();
    const r = await httpGet(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=${encodeURIComponent(vs)}`);
    if (r.status !== 200) return { statusCode: 502, data: { status: false, error: 'Upstream failed' } };
    return { status: true, result: { prices: r.data, source: 'coingecko' } };
  }
};
