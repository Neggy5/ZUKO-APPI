'use strict';
const { httpGet } = require('../lib/httpGet');
module.exports = {
  name: 'Pokemon', method: 'GET', path: '/v1/pokemon', category: 'Fun',
  description: 'Pokemon info (PokeAPI)',
  async execute({ query }) {
    const name = String(query.name || query.q || 'pikachu').trim().toLowerCase();
    const r = await httpGet(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(name)}`);
    if (r.status !== 200) return { statusCode: 404, data: { status: false, error: 'Pokemon not found' } };
    const p = r.data;
    return { status: true, result: {
      id: p.id, name: p.name, height: p.height, weight: p.weight,
      types: (p.types || []).map(t => t.type.name),
      sprite: p.sprites?.front_default || null, source: 'pokeapi'
    }};
  }
};
