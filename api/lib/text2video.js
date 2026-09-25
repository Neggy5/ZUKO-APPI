'use strict';

/**
 * Free text-to-video via Lightricks LTX Gradio Space (Hugging Face)
 * Space: https://lightricks-ltx-video-distilled.hf.space
 * No API key required.
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

const SPACE =
  process.env.LTX_SPACE_URL || 'https://lightricks-ltx-video-distilled.hf.space';
const TIMEOUT = Number(process.env.TEXT2VIDEO_TIMEOUT_MS || 110000);
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function request(method, urlStr, { body, headers, timeout = TIMEOUT, stream = false } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'http:' ? http : https;
    const payload =
      body == null ? null : typeof body === 'string' ? body : JSON.stringify(body);
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || undefined,
        path: u.pathname + u.search,
        method,
        headers: {
          'User-Agent': UA,
          Accept: '*/*',
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
            : {}),
          ...headers,
        },
        timeout,
      },
      (res) => {
        if (stream) {
          resolve(res);
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let data = raw;
          try {
            data = JSON.parse(raw);
          } catch (_) {}
          resolve({ status: res.statusCode, data, raw, headers: res.headers });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Text2Video request timed out.'));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function readSSE(res, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => {
      res.destroy();
      reject(new Error('Text2Video generation timed out waiting for result.'));
    }, timeoutMs);

    res.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      const parts = buf.split('\n');
      buf = parts.pop() || '';
      let event = null;
      for (const line of parts) {
        if (line.startsWith('event:')) {
          event = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          const dataStr = line.slice(5).trim();
          if (event === 'complete' || event === 'error' || dataStr.startsWith('[')) {
            clearTimeout(timer);
            try {
              const data = JSON.parse(dataStr);
              resolve({ event: event || 'complete', data });
            } catch (e) {
              if (event === 'error') reject(new Error(dataStr));
              else reject(e);
            }
            return;
          }
        }
      }
    });
    res.on('end', () => {
      clearTimeout(timer);
      reject(new Error('Text2Video stream ended without a complete event.'));
    });
    res.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

/**
 * @param {string} prompt
 * @param {{ duration?: number, width?: number, height?: number, negative?: string, seed?: number }} opts
 */
async function generate(prompt, opts = {}) {
  const text = String(prompt || '').trim();
  if (!text) {
    throw Object.assign(new Error('prompt is required'), { statusCode: 400 });
  }
  if (text.length > 800) {
    throw Object.assign(new Error('prompt too long (max 800 chars)'), { statusCode: 400 });
  }

  const width = Number(opts.width || 704);
  const height = Number(opts.height || 512);
  const duration = Math.min(Math.max(Number(opts.duration || 2), 1), 5);
  const negative =
    opts.negative ||
    'worst quality, inconsistent motion, blurry, distorted, watermark, text';
  const seed = opts.seed != null ? Number(opts.seed) : 42;
  const randomize = opts.seed == null;

  const data = [
    text,
    negative,
    null,
    null,
    height,
    width,
    'text-to-video',
    duration,
    9,
    seed,
    randomize,
    1.0,
    true,
  ];

  const call = await request('POST', `${SPACE}/gradio_api/call/text_to_video`, {
    body: { data },
    timeout: 60000,
  });

  if (call.status !== 200 || !call.data?.event_id) {
    const msg =
      typeof call.data === 'object'
        ? call.data.error || call.data.detail || JSON.stringify(call.data).slice(0, 200)
        : String(call.raw || '').slice(0, 200);
    throw Object.assign(new Error(msg || `LTX call failed (${call.status})`), {
      statusCode: call.status === 429 ? 429 : 502,
    });
  }

  const eventId = call.data.event_id;
  const streamRes = await request(
    'GET',
    `${SPACE}/gradio_api/call/text_to_video/${eventId}`,
    { stream: true, timeout: TIMEOUT }
  );

  if (streamRes.statusCode && streamRes.statusCode >= 400) {
    throw Object.assign(new Error(`LTX stream HTTP ${streamRes.statusCode}`), {
      statusCode: 502,
    });
  }

  const result = await readSSE(streamRes, TIMEOUT);
  if (result.event === 'error') {
    throw Object.assign(new Error(String(result.data)), { statusCode: 502 });
  }

  const payload = Array.isArray(result.data) ? result.data[0] : result.data;
  const videoObj = payload && (payload.video || payload);
  let videoUrl =
    (videoObj && (videoObj.url || videoObj.path)) ||
    (typeof payload === 'string' ? payload : null);

  if (!videoUrl) {
    throw Object.assign(new Error('LTX returned no video URL.'), { statusCode: 502 });
  }

  if (videoUrl.startsWith('/')) {
    videoUrl = SPACE + videoUrl;
  } else if (!/^https?:\/\//i.test(videoUrl) && videoUrl.includes('/tmp/')) {
    videoUrl = `${SPACE}/gradio_api/file=${videoUrl}`;
  }

  return {
    prompt: text,
    video_url: videoUrl,
    download_url: videoUrl,
    width,
    height,
    duration,
    source: 'ltx-video-distilled',
    space: SPACE,
  };
}

module.exports = { generate, SPACE };
