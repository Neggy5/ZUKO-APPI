'use strict';
const { httpGet } = require('../lib/httpGet');
module.exports = {
  name: 'Random Meal', method: 'GET', path: '/v1/meal', category: 'Fun',
  description: 'Random meal recipe (TheMealDB)',
  async execute() {
    const r = await httpGet('https://www.themealdb.com/api/json/v1/1/random.php');
    if (r.status !== 200 || !r.data.meals) return { statusCode: 502, data: { status: false, error: 'Upstream failed' } };
    const m = r.data.meals[0];
    return { status: true, result: {
      id: m.idMeal, name: m.strMeal, category: m.strCategory, area: m.strArea,
      instructions: m.strInstructions, thumbnail: m.strMealThumb, youtube: m.strYoutube, source: 'themealdb'
    }};
  }
};
