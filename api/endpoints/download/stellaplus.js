'use strict';

/**
 * StellaPlus
 * Search: GET /download/stellaplus?q=query
 * Download: GET /download/stellaplus?url=https://...
 */

const { scrapeList, scrapePost, SITES } = require('../../lib/naijaSites');

module.exports = {
  path: '/download/stellaplus',
  method: 'GET',
  description: 'StellaPlus search + direct MP4 extract',
  query: {
    q: 'Search query (optional)',
    url: 'Post URL to extract video (optional)',
    limit: 'Max search results (default 10)',
  },

  async handler(req, res) {
    try {
      const q = (req.query.q || req.query.query || '').trim();
      const url = (req.query.url || req.query.link || '').trim();
      const limit = Math.min(parseInt(req.query.limit, 10) || 10, 20);
      const siteKey = 'stellaplus';
      const site = SITES[siteKey];

      if (url) {
        if (!url.includes(site.base.replace('https://', ''))) {
          return res.status(400).json({
            success: false,
            error: 'URL must be from ' + site.base,
          });
        }
        const post = await scrapePost(siteKey, url);
        if (!post.video && !post.embed) {
          return res.status(404).json({
            success: false,
            error: 'No direct video found on this page',
            data: post,
          });
        }
        return res.json({
          success: true,
          source: siteKey,
          data: {
            title: post.title,
            url: post.url,
            thumbnail: post.thumbnail,
            video: post.video,
            embed: post.embed,
            download: post.video || post.embed,
          },
        });
      }

      if (q) {
        const posts = await scrapeList(siteKey, site.search(q), limit);
        return res.json({
          success: true,
          source: siteKey,
          query: q,
          count: posts.length,
          results: posts,
        });
      }

      // default: latest from homepage
      const posts = await scrapeList(siteKey, site.base + '/', limit);
      return res.json({
        success: true,
        source: siteKey,
        query: null,
        count: posts.length,
        results: posts,
      });
    } catch (e) {
      console.error('[stellaplus]', e);
      return res.status(500).json({ success: false, error: e.message || 'Scrape failed' });
    }
  },
};
