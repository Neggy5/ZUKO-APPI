'use strict';
const { httpGet } = require('../lib/httpGet');
module.exports = {
  name: 'Random Cocktail', method: 'GET', path: '/v1/cocktail', category: 'Fun',
  description: 'Random cocktail (TheCocktailDB)',
  async execute() {
    const r = await httpGet('https://www.thecocktaildb.com/api/json/v1/1/random.php');
    if (r.status !== 200 || !r.data.drinks) return { statusCode: 502, data: { status: false, error: 'Upstream failed' } };
    const d = r.data.drinks[0];
    return { status: true, result: {
      id: d.idDrink, name: d.strDrink, category: d.strCategory, alcoholic: d.strAlcoholic,
      instructions: d.strInstructions, thumbnail: d.strDrinkThumb, source: 'thecocktaildb'
    }};
  }
};
