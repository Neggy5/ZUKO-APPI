'use strict';

/**
 * KnackVideos — ZUKO v1 endpoint
 * GET /v1/download/knackvideos?q=search
 * GET /v1/download/knackvideos?url=https://...
 */

const { scrapeList, scrapePost, SITES } = require('../../lib/naijaSites');

module.exports = {
  name: 'KnackVideos',
  method: 'GET',
  path: '/v1/download/knackvideos',
  category: 'Download',
  description: 'Search or download from KnackVideos',

  async execute({ query, ctx }) {
    const siteKey = 'knackvideos';
    const site = SITES[siteKey];
    const q = ctx && ctx.cleanString
      ? ctx.cleanString(query.q || query.query || '', 120)
      : String(query.q || query.query || '').trim();
    const url = ctx && ctx.cleanString
      ? ctx.cleanString(query.url || query.link || '', 500)
      : String(query.url || query.link || '').trim();
    const limit = Math.min(parseInt(query.limit, 10) || 10, 20);

    if (url) {
      if (!url.includes(site.base.replace('https://', ''))) {
        return { status: false, error: 'URL must be from ' + site.base };
      }
      const post = await scrapePost(siteKey, url);
      if (!post.video && !post.embed) {
        return { status: false, error: 'No direct video found', data: post };
      }
      return {
        status: true,
        source: siteKey,
        data: {
          title: post.title,
          url: post.url,
          thumbnail: post.thumbnail,
          video: post.video,
          embed: post.embed,
          download: post.video || post.embed,
        },
      };
    }

    const listUrl = q ? site.search(q) : site.base + '/';
    const results = await scrapeList(siteKey, listUrl, limit);
    return {
      status: true,
      source: siteKey,
      query: q || null,
      count: results.length,
      results,
    };
  },
};
