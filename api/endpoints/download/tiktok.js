'use strict';
const social = require('./social');
const { detectPlatform, normalizeUrl } = require('../../lib/social');
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
      const normalizedUrl = normalizeUrl(u);
      const detected = detectPlatform(normalizedUrl);
      if (detected !== 'tiktok') return { statusCode: 400, data:{status:false,error:'This endpoint only accepts tiktok URLs.'} };
      return social.execute({ query: { ...query, url: normalizedUrl }, req, res, ctx });
    } catch (e) { throw e; }
  }
};
