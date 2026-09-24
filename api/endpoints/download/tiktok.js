'use strict';
const social = require('./social');
module.exports = {
  name: 'Tiktok Downloader',
  method: 'GET',
  path: '/v1/download/tiktok',
  category: 'Download',
  description: 'Download public tiktok media through the ZUKO first-party yt-dlp engine.',
  async execute({ query, req, res, ctx }) {
    const u = String(query.url || '');
    if (!u) return { statusCode: 400, data: { status:false, error:'url is required' } };
    try {
      const detected = require('../../lib/social').detectPlatform(u);
      if (detected !== 'tiktok') return { statusCode: 400, data:{status:false,error:'This endpoint only accepts tiktok URLs.'} };
      return social.execute({ query, req, res, ctx });
    } catch (e) { throw e; }
  }
};
