'use strict';

const lyrics = require('../lib/lyrics');

module.exports = {
  name: 'Lyrics',
  method: 'GET',
  path: '/v1/lyrics',
  category: 'Search',
  description: 'Song lyrics via LRCLIB (+ lyrics.ovh fallback). Query: q | artist+title',

  async execute({ query }) {
    const q = String(query.q || query.query || query.song || '').trim();
    const artist = String(query.artist || query.a || '').trim();
    const title = String(query.title || query.t || query.track || '').trim();
    const album = String(query.album || '').trim() || undefined;
    const duration = query.duration ? Number(query.duration) : undefined;

    if (!q && !title) {
      return {
        statusCode: 400,
        data: {
          status: false,
          error: 'Provide q= (search) or title= + artist=',
        },
      };
    }

    try {
      const result = await lyrics.resolve({ q, artist, title, album, duration });
      if (!result) {
        return {
          statusCode: 404,
          data: { status: false, error: 'Lyrics not found.' },
        };
      }

      return {
        status: true,
        success: true,
        result: {
          title: result.title,
          artist: result.artist,
          album: result.album,
          duration: result.duration,
          instrumental: result.instrumental,
          lyrics: result.lyrics,
          synced_lyrics: result.synced_lyrics,
          source: result.source,
        },
      };
    } catch (err) {
      return {
        statusCode: 502,
        data: { status: false, error: err.message || 'Lyrics lookup failed.' },
      };
    }
  },
};
