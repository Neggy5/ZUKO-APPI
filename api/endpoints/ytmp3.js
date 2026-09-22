'use strict';

const { download, MAX_FILE_BYTES } = require('../lib/youtube-scraper');

module.exports = {
  name: 'YouTube MP3',
  method: 'GET',
  path: '/v1/ytmp3',
  category: 'Download',
  description: 'Download public YouTube media as MP3 audio through the configured external scraper.',
  async execute({ query, res }) {
    if (!query.url) return { statusCode: 400, data: { status: false, error: 'url is required' } };
    try {
      const job = await download(query.url, 'audio');
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Disposition', `attachment; filename="${job.filename.replace(/[^\w. -]/g, '_')}"`);
      res.setHeader('Content-Length', String(job.size));
      res.setHeader('X-ZUKO-Max-File-Bytes', String(MAX_FILE_BYTES));
      res.on('finish', job.cleanup); res.on('close', job.cleanup);
      res.flushHeaders();
      const stream = require('fs').createReadStream(job.filepath);
      stream.on('error', job.cleanup);
      stream.pipe(res);
      return null;
    } catch (error) {
      return { statusCode: 502, data: { status: false, error: error.message || 'YouTube scraper failed.' } };
    }
  }
};
