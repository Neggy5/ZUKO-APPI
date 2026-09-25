'use strict';
const { httpGet } = require('../lib/httpGet');
module.exports = {
  name: 'Anime', method: 'GET', path: '/v1/anime', category: 'Fun',
  description: 'Anime search (Jikan/MAL)',
  async execute({ query }) {
    const q = String(query.q || query.name || '').trim();
    const id = String(query.id || '').trim();
    let r;
    if (id) r = await httpGet(`https://api.jikan.moe/v4/anime/${encodeURIComponent(id)}`);
    else if (q) r = await httpGet(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q)}&limit=5`);
    else r = await httpGet('https://api.jikan.moe/v4/anime/1');
    if (r.status !== 200) return { statusCode: 502, data: { status: false, error: 'Upstream failed' } };
    if (r.data.data && Array.isArray(r.data.data)) {
      return { status: true, result: { items: r.data.data.map(a => ({
        id: a.mal_id, title: a.title, score: a.score, episodes: a.episodes, image: a.images?.jpg?.image_url
      })), source: 'jikan' }};
    }
    const a = r.data.data;
    return { status: true, result: {
      id: a.mal_id, title: a.title, synopsis: a.synopsis, score: a.score, episodes: a.episodes,
      image: a.images?.jpg?.image_url, source: 'jikan'
    }};
  }
};
