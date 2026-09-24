'use strict';
const ytmp4 = require('../ytmp4');

module.exports = {
  ...ytmp4,
  name: 'YouTube MP4 Download',
  path: '/v1/download/ytmp4',
  description: 'Alias of /v1/ytmp4.',
};
