'use strict';
const { httpGet } = require('../lib/httpGet');
module.exports = {
  name: 'Weather', method: 'GET', path: '/v1/weather', category: 'Info',
  description: 'Current weather (Open-Meteo). Optional city= or lat=&lon=',
  async execute({ query }) {
    let lat = query.lat, lon = query.lon;
    const city = String(query.city || query.q || '').trim();
    if (city && (!lat || !lon)) {
      const g = await httpGet(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`);
      if (g.status !== 200 || !g.data.results?.length) return { statusCode: 404, data: { status: false, error: 'City not found' } };
      lat = g.data.results[0].latitude;
      lon = g.data.results[0].longitude;
      var place = g.data.results[0].name;
      var country = g.data.results[0].country;
    }
    lat = lat || 9.08; lon = lon || 7.49;
    const r = await httpGet(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
    if (r.status !== 200) return { statusCode: 502, data: { status: false, error: 'Upstream failed' } };
    return { status: true, result: {
      place: typeof place !== 'undefined' ? place : null,
      country: typeof country !== 'undefined' ? country : null,
      latitude: Number(lat), longitude: Number(lon),
      current: r.data.current_weather, source: 'open-meteo'
    }};
  }
};
