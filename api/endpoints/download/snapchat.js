'use strict';

const social = require('./social');

module.exports = {
  name: 'Snapchat Downloader',
  method: 'GET',
  path: '/v1/download/snapchat',
  category: 'Download',
  description: 'Download public Snapchat media using the ZUKO first-party yt-dlp engine.',
  async execute(ctx) {
    if (!ctx.query?.url) {
      return { statusCode: 400, data: { status: false, error: 'url is required' } };
    }
    const url = String(ctx.query.url);
    const host = new URL(url).hostname.toLowerCase();
    if (!/(^|\.)snapchat\.com$/.test(host)) {
      return { statusCode: 400, data: { status: false, error: 'A Snapchat URL is required' } };
    }
    return social.execute(ctx);
  }
};
