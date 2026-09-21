'use strict';

const { inspect, download } = require('../../lib/ytdlp');
const { detectPlatform } = require('../../lib/social');
const fs = require('fs');

const definition = {
  name: 'Social Media Downloader',
  method: 'GET',
  path: '/v1/download/social',
  category: 'Download',
  description: 'Download public social-media video/audio using the ZUKO first-party yt-dlp engine.'
};

function safeFilename(name) {
  return String(name || 'zuko-media').replace(/[^\w. -]/g, '_').slice(0, 180);
}

async function execute({ query, res }) {
  if (!query.url) return { statusCode: 400, data: { status: false, error: 'url is required' } };
  const platform = detectPlatform(query.url);
  const mode = String(query.type || query.format || 'video').toLowerCase();
  if (!['video', 'audio', 'info'].includes(mode)) {
    return { statusCode: 400, data: { status: false, error: 'type must be video, audio or info' } };
  }

  if (mode === 'info') {
    return { status: true, platform, result: await inspect(query.url, 'info') };
  }

  const job = await download(query.url, mode, query.quality);
  const filename = safeFilename(`${platform}-${job.filename}`);
  res.setHeader('Content-Type', mode === 'audio' ? 'audio/mpeg' : 'video/mp4');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', String(job.size));
  res.setHeader('X-ZUKO-Platform', platform);
  res.setHeader('X-ZUKO-Download-Engine', 'yt-dlp');
  res.on('finish', job.cleanup);
  res.on('close', job.cleanup);
  const stream = fs.createReadStream(job.filepath);
  stream.on('error', job.cleanup);
  stream.pipe(res);
  return null;
}

module.exports = { ...definition, execute };
