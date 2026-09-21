'use strict';
const social = require('./social');
module.exports = {
  name: 'Instagram Downloader',
  method: 'GET',
  path: '/v1/download/instagram',
  category: 'Download',
  description: 'Download public instagram media through the ZUKO first-party yt-dlp engine.',
  async execute({ query, req, res, ctx }) {
    const u = String(query.url || '');
    if (!u) return { statusCode: 400, data: { status:false, error:'url is required' } };
    try {
      const detected = require('../../lib/social').detectPlatform(u);
      if (detected !== 'instagram') return { statusCode: 400, data:{status:false,error:'This endpoint only accepts instagram URLs.'} };
      return social.execute({ query, req, res, ctx });
    } catch (e) { throw e; }
  }
};
