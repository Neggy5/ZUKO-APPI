'use strict';

const SOCIAL_HOSTS = {
  tiktok: [
    /^(?:www\.)?tiktok\.com$/i,
    /^(?:www\.)?vm\.tiktok\.com$/i,
    /^(?:www\.)?vt\.tiktok\.com$/i,
    /^(?:www\.)?m\.tiktok\.com$/i
  ],
  instagram: [
    /^(?:www\.)?instagram\.com$/i,
    /^(?:www\.)?instagr\.am$/i
  ],
  facebook: [
    /^(?:www\.)?facebook\.com$/i,
    /^(?:www\.)?fb\.watch$/i,
    /^(?:www\.)?fb\.com$/i,
    /^(?:m\.)?facebook\.com$/i
  ],
  twitter: [
    /^(?:www\.)?(?:twitter|x)\.com$/i,
    /^(?:mobile\.)?(?:twitter|x)\.com$/i
  ],
  pinterest: [
    /^(?:www\.)?pinterest\.com$/i,
    /^(?:www\.)?pin\.it$/i
  ],
  snapchat: [
    /^(?:www\.)?snapchat\.com$/i,
    /^(?:www\.)?t\.snapchat\.com$/i,
    /^(?:www\.)?story\.snapchat\.com$/i
  ]
};

function detectPlatform(rawUrl) {
  let url;
  try { url = new URL(String(rawUrl || '').trim()); }
  catch { throw new Error('Invalid URL.'); }

  const host = url.hostname.toLowerCase().replace(/^www\./, 'www.');
  for (const [platform, patterns] of Object.entries(SOCIAL_HOSTS)) {
    if (patterns.some(re => re.test(host))) return platform;
  }
  throw new Error('Unsupported social platform. Supported: TikTok, Instagram, Facebook, X/Twitter, Pinterest and Snapchat.');
}

function normalizeUrl(rawUrl) {
  const url = new URL(String(rawUrl || '').trim());
  // Resolve common mobile/share redirects without changing the public API contract.
  url.hash = '';
  return url.toString();
}

module.exports = { detectPlatform, normalizeUrl, SOCIAL_HOSTS };
