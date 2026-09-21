'use strict';

const SOCIAL_HOSTS = {
  tiktok: [/^(?:www\.)?tiktok\.com$/i, /^(?:www\.)?vm\.tiktok\.com$/i, /^(?:www\.)?vt\.tiktok\.com$/i],
  instagram: [/^(?:www\.)?instagram\.com$/i],
  facebook: [/^(?:www\.)?facebook\.com$/i, /^(?:www\.)?fb\.watch$/i, /^(?:www\.)?fb\.com$/i],
  twitter: [/^(?:www\.)?(?:twitter|x)\.com$/i],
  pinterest: [/^(?:www\.)?pinterest\.com$/i, /^(?:www\.)?pin\.it$/i],
  snapchat: [/^(?:www\.)?snapchat\.com$/i, /^(?:www\.)?t\.snapchat\.com$/i]
};

function detectPlatform(rawUrl) {
  let url;
  try { url = new URL(String(rawUrl || '').trim()); } catch { throw new Error('Invalid URL.'); }
  const host = url.hostname.toLowerCase();
  for (const [platform, patterns] of Object.entries(SOCIAL_HOSTS)) {
    if (patterns.some(re => re.test(host))) return platform;
  }
  throw new Error('Unsupported social platform. Supported: TikTok, Instagram, Facebook, X/Twitter, Pinterest and Snapchat.');
}

module.exports = { detectPlatform, SOCIAL_HOSTS };
