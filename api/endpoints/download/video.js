'use strict';
const ytmp4 = require('../ytmp4');
module.exports = {
  ...ytmp4,
  name: 'Video Download',
  path: '/v1/download/video',
  description: 'Alias of /v1/ytmp4 (Save-Tube primary).',
};
