'use strict';

const { download: scraperDownload, MAX_FILE_BYTES } = require('../lib/youtube-scraper');
const { download: ytDlpDownload } = require('../lib/ytdlp');

module.exports = {
  name: 'YouTube MP4',
  method: 'GET',
  path: '/v1/ytmp4',
  category: 'Download',
  description: 'Download public YouTube media as MP4 video through the configured external scraper.',
  async execute({ query, res }) {
    if (!query.url) return { statusCode: 400, data: { status: false, error: 'url is required' } };
    try {
      let job;
      try { job = await scraperDownload(query.url, 'video', query.quality); }
      catch (scraperError) {
        console.warn('[ytmp4] external scraper failed, falling back to local yt-dlp:', scraperError.message);
        job = await ytDlpDownload(query.url, 'video', query.quality); 
      }
      if (!job.size || job.size <= 0) throw Object.assign(new Error('Downloaded media file is empty or corrupted.'), { statusCode: 502 });
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', `attachment; filename="${job.filename.replace(/[^\w. -]/g, '_')}"`);
      res.setHeader('Content-Length', String(job.size));
      res.setHeader('X-ZUKO-Max-File-Bytes', String(MAX_FILE_BYTES));
      res.on('finish', job.cleanup); res.on('close', job.cleanup);
      res.flushHeaders();
      const stream = require('fs').createReadStream(job.filepath);
      stream.on('error', (err) => { job.cleanup(); if (!res.headersSent) res.status(502); res.destroy(err); });
      stream.pipe(res);
      return null;
    } catch (error) {
      return { statusCode: 502, data: { status: false, error: error.message || 'YouTube scraper failed.' } };
    }
  }
};
