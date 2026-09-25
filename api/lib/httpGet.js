'use strict';
const https = require('https');
const http = require('http');
const { URL } = require('url');

function httpGet(urlStr, { timeout = 15000, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.get(
      urlStr,
      {
        headers: {
          'User-Agent': 'ZUKO-API/1.0',
          Accept: 'application/json, text/plain, */*',
          ...headers,
        },
        timeout,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          const raw = buf.toString('utf8');
          let data = raw;
          try {
            data = JSON.parse(raw);
          } catch (_) {}
          resolve({ status: res.statusCode, data, headers: res.headers, buf });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Upstream timeout'));
    });
  });
}

module.exports = { httpGet };
