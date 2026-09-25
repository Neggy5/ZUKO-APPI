'use strict';
const { httpGet } = require('../lib/httpGet');
module.exports = {
  name: 'Joke', method: 'GET', path: '/v1/joke', category: 'Fun',
  description: 'Random joke (JokeAPI)',
  async execute({ query }) {
    const cat = encodeURIComponent(query.category || 'Any');
    const r = await httpGet(`https://v2.jokeapi.dev/joke/${cat}?type=single`);
    if (r.status !== 200 || r.data.error) return { statusCode: 502, data: { status: false, error: r.data?.message || 'Upstream failed' } };
    return { status: true, result: { joke: r.data.joke, category: r.data.category, source: 'jokeapi' } };
  }
};
