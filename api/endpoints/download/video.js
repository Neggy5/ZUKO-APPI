'use strict';
const { download, MAX_FILE_BYTES } = require('../../lib/ytdlp');
module.exports = {
  name: 'Video Download', method: 'GET', path: '/v1/download/video', category: 'Download',
  description: 'Download public video media through the ZUKO first-party yt-dlp engine.',
  async execute({ query, res }) {
    if (!query.url) return { statusCode:400, data:{ status:false, error:'url is required' } };
    const job = await download(query.url, 'video', query.quality);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${job.filename.replace(/[^\w. -]/g, '_')}"`);
    res.setHeader('Content-Length', String(job.size));
    res.setHeader('X-ZUKO-Max-File-Bytes', String(MAX_FILE_BYTES));
    res.on('finish', job.cleanup); res.on('close', job.cleanup);
    // Commit streaming headers before endpoint-loader can serialize null.
    res.flushHeaders();
    const stream = require('fs').createReadStream(job.filepath); stream.on('error', job.cleanup); stream.pipe(res);
    return null;
  }
};
