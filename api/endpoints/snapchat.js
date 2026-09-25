'use strict';

const storygrab = require('../lib/storygrab');

module.exports = {
  name: 'Snapchat Downloader (StoryGrab)',
  method: 'GET',
  path: '/v1/download/snapchat',
  category: 'Download',
  description:
    'Download public Snapchat stories / spotlights / profile media via StoryGrab. Query: url (profile, story, spotlight, or username).',

  async execute({ query }) {
    const input = String(query.url || query.username || query.user || query.link || '').trim();
    if (!input) {
      return {
        statusCode: 400,
        data: { status: false, error: 'url or username is required' },
      };
    }

    try {
      const result = await storygrab.resolve(input);
      if (result.empty && !result.medias.length) {
        return {
          statusCode: 404,
          data: {
            status: false,
            error: 'No public Snapchat media found for this profile/URL.',
            title: result.title,
            source: 'storygrab',
          },
        };
      }
      return {
        status: true,
        success: true,
        platform: 'snapchat',
        result: {
          title: result.title,
          query: result.query,
          download_url: result.download_url,
          url: result.download_url,
          medias: result.medias,
          source: 'storygrab',
        },
      };
    } catch (e) {
      return {
        statusCode: e.statusCode || 502,
        data: {
          status: false,
          error: e.message || 'Snapchat download failed.',
          code: e.code,
          source: 'storygrab',
        },
      };
    }
  },
};
