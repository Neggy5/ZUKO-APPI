'use strict';

const { inspect, download } = require('../../lib/ytdlp');
const fs = require('fs');

const definition = {
  name: 'Snapchat Downloader',
  method: 'GET',
  path: '/v1/download/snapchat',
  category: 'Download',
  description: 'Download public Snapchat media using the ZUKO yt-dlp engine.'
};

function isSnapchatUrl(raw) {
  try {
    const host = new URL(String(raw || '').trim()).hostname.toLowerCase();
    return /^(?:www\.)?(?:snapchat\.com|t\.snapchat\.com)$/.test(host);
  } catch {
    return false;
  }
}

function safeFilename(name) {
  return String(name || 'snapchat-media')
    .replace(/[^\w. -]/g, '_')
    .slice(0, 180);
}

async function execute({ query, res }) {
  const url = String(query?.url || '').trim();

  if (!url)
    return { statusCode: 400, data: { status: false, error: 'url is required' } };

  if (!isSnapchatUrl(url))
    return { statusCode: 400, data: { status: false, error: 'A Snapchat URL is required' } };

  const mode = String(query?.type || query?.format || 'video').toLowerCase();

  if (!['video', 'audio', 'info'].includes(mode))
    return { statusCode: 400, data: { status: false, error: 'type must be video, audio or info' } };

  if (mode === 'info') {
    return {
      status: true,
      platform: 'snapchat',
      result: await inspect(url, 'info')
    };
  }

  const job = await download(url, mode, query?.quality);
  const filename = safeFilename(`snapchat-${job.filename}`);

  res.setHeader('Content-Type', mode === 'audio' ? 'audio/mpeg' : 'video/mp4');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', String(job.size));
  res.setHeader('X-ZUKO-Platform', 'snapchat');
  res.setHeader('X-ZUKO-Download-Engine', 'yt-dlp');

  res.on('finish', job.cleanup);
  res.on('close', job.cleanup);
  res.flushHeaders();

  const stream = fs.createReadStream(job.filepath);
  stream.on('error', (error) => {
    job.cleanup();
    if (!res.headersSent) res.status(500).json({ status: false, error: error.message });
    else res.destroy(error);
  });
  stream.pipe(res);

  return null;
}

module.exports = { ...definition, execute };
