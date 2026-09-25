'use strict';

const savefromins = require('../../lib/savefromins');

module.exports = {
  name: 'Instagram via SaveFromIns',
  method: 'GET',
  path: '/v1/download/ig-savefromins',
  category: 'Download',
  description: 'Instagram media parse via SaveFromIns only (JSON).',

  async execute({ query }) {
    const u = String(query.url || query.link || '').trim();
    if (!u) return { statusCode: 400, data: { status: false, error: 'url is required' } };
    if (!/instagram\.com|instagr\.am/i.test(u)) {
      return { statusCode: 400, data: { status: false, error: 'Instagram URL required' } };
    }
    try {
      const result = await savefromins.parse(u);
      return {
        status: true,
        result: {
          title: result.title,
          thumbnail: result.thumbnail,
          duration: result.duration,
          download_url: savefromins.pickVideo(result),
          medias: result.medias,
          source: 'savefromins',
        },
      };
    } catch (e) {
      return {
        statusCode: e.statusCode || 502,
        data: { status: false, error: e.message, code: e.code, retryable: e.code === 'analyze_risk' },
      };
    }
  },
};
