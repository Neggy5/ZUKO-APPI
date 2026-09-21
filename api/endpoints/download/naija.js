'use strict';

/**
 * Combined Naija adult sites
 * GET /download/naija?url=<any of the 4 sites>
 * GET /download/naija?q=lagos&site=darknaija|naijaxx|stellaplus|knackvideos
 * GET /download/naija?q=lagos  (searches darknaija by default)
 */

const {
  scrapeList,
  scrapePost,
  detectSite,
  SITES,
} = require('../../lib/naijaSites');

module.exports = {
  path: '/download/naija',
  method: 'GET',
  description: 'Multi-site Naija adult search/download (darknaija, naijaxx, stellaplus, knackvideos)',
  query: {
    url: 'Post URL (auto-detect site)',
    q: 'Search query',
    site: 'darknaija | naijaxx | stellaplus | knackvideos',
    limit: 'Max results (default 10)',
  },

  async handler(req, res) {
    try {
      const q = (req.query.q || req.query.query || '').trim();
      const url = (req.query.url || req.query.link || '').trim();
      const limit = Math.min(parseInt(req.query.limit, 10) || 10, 20);
      let siteKey = (req.query.site || '').toLowerCase().trim();

      if (url) {
        siteKey = detectSite(url);
        if (!siteKey) {
          return res.status(400).json({
            success: false,
            error: 'Unsupported URL. Use darknaija, naijaxx, stellaplus, or knackvideos links.',
          });
        }
        const post = await scrapePost(siteKey, url);
        if (!post.video && !post.embed) {
          return res.status(404).json({
            success: false,
            error: 'No direct video found',
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

      if (!siteKey) siteKey = 'darknaija';
      if (!SITES[siteKey]) {
        return res.status(400).json({
          success: false,
          error: 'site must be one of: ' + Object.keys(SITES).join(', '),
        });
      }

      const listUrl = q ? SITES[siteKey].search(q) : SITES[siteKey].base + '/';
      const posts = await scrapeList(siteKey, listUrl, limit);
      return res.json({
        success: true,
        source: siteKey,
        query: q || null,
        count: posts.length,
        results: posts,
      });
    } catch (e) {
      console.error('[naija]', e);
      return res.status(500).json({ success: false, error: e.message || 'Scrape failed' });
    }
  },
};
