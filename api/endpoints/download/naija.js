'use strict';

const {
  scrapeList,
  scrapePost,
  detectSite,
  SITES,
} = require('../../lib/naijaSites');

module.exports = {
  name: 'Naija Multi',
  method: 'GET',
  path: '/v1/download/naija',
  category: 'Download',
  description: 'Multi-site Naija adult search/download (auto-detect URL host)',

  async execute({ query, ctx }) {
    const clean = (v, n) =>
      ctx && ctx.cleanString ? ctx.cleanString(v || '', n) : String(v || '').trim();

    const q = clean(query.q || query.query, 120);
    const url = clean(query.url || query.link, 500);
    const limit = Math.min(parseInt(query.limit, 10) || 10, 20);
    let siteKey = clean(query.site, 40).toLowerCase();

    if (url) {
      siteKey = detectSite(url);
      if (!siteKey) {
        return {
          status: false,
          error: 'Unsupported URL. Use darknaija, naijaxx, stellaplus, or knackvideos.',
        };
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

    if (!siteKey) siteKey = 'darknaija';
    if (!SITES[siteKey]) {
      return {
        status: false,
        error: 'site must be one of: ' + Object.keys(SITES).join(', '),
      };
    }

    const listUrl = q ? SITES[siteKey].search(q) : SITES[siteKey].base + '/';
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
