'use strict';
const ytmp3 = require('../ytmp3');
module.exports = {
  ...ytmp3,
  name: 'Audio Download',
  path: '/v1/download/audio',
  description: 'Alias of /v1/ytmp3 (Save-Tube primary).',
};
