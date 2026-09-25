'use strict';
const { httpGet } = require('../lib/httpGet');
module.exports = {
  name: 'Country', method: 'GET', path: '/v1/country', category: 'Info',
  description: 'Country info by name',
  async execute({ query }) {
    const name = String(query.name || query.q || 'Nigeria').trim();
    const r = await httpGet(`https://restcountries.com/v3.1/name/${encodeURIComponent(name)}`);
    if (r.status !== 200 || !Array.isArray(r.data)) return { statusCode: 404, data: { status: false, error: 'Country not found' } };
    const c = r.data[0];
    return { status: true, result: {
      name: c.name?.common, official: c.name?.official, capital: c.capital, region: c.region,
      population: c.population, flag: c.flags?.png || c.flags?.svg, currencies: c.currencies, languages: c.languages,
      source: 'restcountries'
    }};
  }
};
