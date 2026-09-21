'use strict';
const social = require('./social');
module.exports = {
  name: 'X/Twitter Downloader',
  method: 'GET',
  path: '/v1/download/twitter',
  category: 'Download',
  description: 'Download public twitter media through the ZUKO first-party yt-dlp engine.',
  async execute({ query, req, res, ctx }) {
    const u = String(query.url || '');
    if (!u) return { statusCode: 400, data: { status:false, error:'url is required' } };
    try {
      const detected = require('../../lib/social').detectPlatform(u);
      if (detected !== 'twitter') return { statusCode: 400, data:{status:false,error:'This endpoint only accepts twitter URLs.'} };
      return social.execute({ query, req, res, ctx });
    } catch (e) { throw e; }
  }
};
