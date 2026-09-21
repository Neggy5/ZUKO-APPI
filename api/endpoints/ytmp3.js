'use strict';

const audio = require('./download/audio');

module.exports = {
  name: 'YouTube MP3',
  method: 'GET',
  path: '/v1/ytmp3',
  category: 'Download',
  description: 'Download public YouTube media as MP3 audio.',
  async execute(ctx) {
    return audio.execute(ctx);
  }
};
