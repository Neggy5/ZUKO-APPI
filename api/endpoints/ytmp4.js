'use strict';

const video = require('./download/video');

module.exports = {
  name: 'YouTube MP4',
  method: 'GET',
  path: '/v1/ytmp4',
  category: 'Download',
  description: 'Download public YouTube media as video.',
  async execute(ctx) {
    return video.execute(ctx);
  }
};
