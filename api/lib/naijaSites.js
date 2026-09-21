'use strict';

const axios = require('axios');
const cheerio = require('cheerio');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const SITES = {
  darknaija: {
    name: 'DarkNaija',
    base: 'https://darknaija.com',
    search: (q) => `https://darknaija.com/?s=${encodeURIComponent(q)}`,
    hostAllow: ['darknaija.com', 'srv-darknaija.com'],
  },
  naijaxx: {
    name: 'NaijaXX',
    base: 'https://naijaxx.com',
    search: (q) => `https://naijaxx.com/?s=${encodeURIComponent(q)}`,
    hostAllow: ['naijaxx.com', 'v-naijaxx.com', 'mediadelivery.net'],
  },
  stellaplus: {
    name: 'StellaPlus',
    base: 'https://stellaplus.xyz',
    search: (q) => `https://stellaplus.xyz/?s=${encodeURIComponent(q)}`,
    hostAllow: ['stellaplus.xyz', 'med.stellaplus.xyz'],
  },
  knackvideos: {
    name: 'KnackVideos',
    base: 'https://knackvideos.com',
    search: (q) => `https://knackvideos.com/?s=${encodeURIComponent(q)}`,
    hostAllow: ['knackvideos.com'],
  },
};

function http() {
  return axios.create({
    timeout: 35000,
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'en-US,en;q=0.9',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    maxRedirects: 5,
    validateStatus: (s) => s >= 200 && s < 400,
  });
}

function absUrl(base, href) {
  if (!href) return '';
  if (href.startsWith('http')) return href;
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

function isAdLink(href) {
  if (!href) return true;
  return /smartpop|xxxjmp|xlivrdr|go\.(xxx|xliv)/i.test(href);
}

async function scrapeList(siteKey, listUrl, limit = 12) {
  const site = SITES[siteKey];
  if (!site) throw new Error('Unknown site');
  const { data } = await http().get(listUrl);
  const $ = cheerio.load(data);
  const posts = [];
  const seen = new Set();

  $('.hentry, article.post, article').each((_, el) => {
    if (posts.length >= limit) return false;
    const a =
      $(el).find('.entry-title a').first().length
        ? $(el).find('.entry-title a').first()
        : $(el).find('h2 a, h3 a').first();
    const title = (a.attr('title') || a.text() || '').trim();
    let href = a.attr('href') || '';
    href = absUrl(site.base, href);
    if (!title || !href || isAdLink(href) || seen.has(href)) return;
    if (!href.includes(site.base.replace('https://', '').split('/')[0].replace('www.', ''))) {
      // still allow same registrable host
      const hostOk = site.hostAllow.some((h) => href.includes(h));
      if (!hostOk) return;
    }
    const img = $(el).find('img').first();
    const thumb = absUrl(
      site.base,
      img.attr('data-src') || img.attr('data-lazy-src') || img.attr('src') || ''
    );
    seen.add(href);
    posts.push({ title, url: href, thumbnail: thumb || null, site: siteKey });
  });

  return posts;
}

async function scrapePost(siteKey, postUrl) {
  const site = SITES[siteKey];
  if (!site) throw new Error('Unknown site');
  const { data } = await http().get(postUrl);
  const $ = cheerio.load(data);
  const title =
    $('meta[property="og:title"]').attr('content') ||
    $('h1.entry-title').text().trim() ||
    $('h1').first().text().trim() ||
    $('title').text().trim();

  const thumb =
    $('meta[property="og:image"]').attr('content') ||
    $('video').attr('poster') ||
    null;

  let video =
    $('video').attr('src') ||
    $('video source').attr('src') ||
    $('source[type="video/mp4"]').attr('src') ||
    null;

  if (video) video = absUrl(site.base, video);

  if (!video) {
    const html = $.html();
    const patterns = [
      /https?:\/\/(?:srv-)?darknaija\.com\/[^"'\s]+\.mp4/i,
      /https?:\/\/med\.stellaplus\.xyz\/[^"'\s]+\.mp4/i,
      /https?:\/\/v-naijaxx\.com\/[^"'\s]+\.mp4/i,
      /https?:\/\/[^"'\s]*stellaplus[^"'\s]*\.mp4/i,
      /https?:\/\/knackvideos\.com\/[^"'\s]+\.mp4/i,
      /https?:\/\/[^"'\s]+\.mp4[^"'\s]*/i,
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m && !/preview|trailer-thumb/i.test(m[0])) {
        video = m[0];
        break;
      }
    }
  }

  // bunny / mediadelivery embed (naijaxx often)
  const iframe = $('iframe').attr('src') || '';
  const embed = /mediadelivery\.net|iframe\.mediadelivery/i.test(iframe) ? iframe : null;

  return {
    site: siteKey,
    siteName: site.name,
    title: title || 'Untitled',
    url: postUrl,
    thumbnail: thumb,
    video,
    embed,
  };
}

function detectSite(url) {
  const u = String(url || '').toLowerCase();
  if (u.includes('darknaija.com')) return 'darknaija';
  if (u.includes('naijaxx.com')) return 'naijaxx';
  if (u.includes('stellaplus.xyz')) return 'stellaplus';
  if (u.includes('knackvideos.com')) return 'knackvideos';
  return null;
}

module.exports = {
  SITES,
  scrapeList,
  scrapePost,
  detectSite,
  isAdLink,
};
