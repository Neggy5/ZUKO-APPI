'use strict';
const axios = require('axios');
const net = require('net');

function isPrivateHost(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h === 'metadata.google.internal') return true;
  if (net.isIP(h) === 4) {
    const p = h.split('.').map(Number);
    return p[0] === 10 || p[0] === 127 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168);
  }
  if (net.isIP(h) === 6) return h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80:');
  return false;
}

function validHttpUrl(value) {
  try {
    const u = new URL(String(value || '').trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch { return false; }
}

function pick(html, re) {
  const m = String(html || '').match(re);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

module.exports = {
  name: 'URL Info', method: 'GET', path: '/v1/tools/url-info', category: 'Tools',
  description: 'Inspect a public URL and extract basic page metadata.',
  async execute({ query }) {
    const target = String(query.url || '').trim();
    if (!validHttpUrl(target)) return { statusCode: 400, data: { status:false, error:'A valid http(s) URL is required.' } };
    if (isPrivateHost(new URL(target).hostname)) return { statusCode:400, data:{status:false,error:'Private or local addresses are not allowed.'} };
    const response = await axios.get(target, {
      timeout: 10000, maxRedirects: 5, responseType: 'text',
      validateStatus: () => true,
      headers: { 'User-Agent': 'ZUKO-APPI/5.2 (+url-info)' },
      maxContentLength: 2 * 1024 * 1024,
      beforeRedirect: (options) => {
        if (isPrivateHost(options.hostname)) throw new Error('Redirected to a private or local address.');
      }
    });
    const html = typeof response.data === 'string' ? response.data : '';
    const finalUrl = response.request?.res?.responseUrl || target;
    const title = pick(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const description = pick(html, /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["']/i)
      || pick(html, /<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["'](?:description|og:description)["']/i);
    const image = pick(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i)
      || pick(html, /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:image["']/i);
    let domain = null;
    try { domain = new URL(finalUrl).hostname; } catch {}
    return { status:true, result:{ url:target, finalUrl, domain, title, description, image, statusCode:response.status, contentType:response.headers['content-type'] || null, contentLength:response.headers['content-length'] ? Number(response.headers['content-length']) : null } };
  }
};
