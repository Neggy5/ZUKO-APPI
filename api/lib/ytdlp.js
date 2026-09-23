'use strict';

const { spawn } = require('child_process');
const fs = require('fs/promises');
const fsSync = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');

const YTDLP_BIN = process.env.YTDLP_BIN || '/usr/local/bin/yt-dlp';
const MAX_FILE_BYTES = Number(process.env.YTDLP_MAX_FILE_BYTES || 100 * 1024 * 1024);
const TIMEOUT_MS = Number(process.env.YTDLP_TIMEOUT_MS || 120000);
const IMPERSONATE_TARGET = String(process.env.YTDLP_IMPERSONATE || 'Chrome-131:Android-14').trim();
const JS_RUNTIMES = String(process.env.YTDLP_JS_RUNTIMES || 'node').trim();
const POT_URL = String(process.env.YTDLP_POT_URL || 'http://127.0.0.1:4416').trim();
const YOUTUBE_CLIENTS = String(process.env.YTDLP_YOUTUBE_CLIENTS || 'mweb').trim();
const YOUTUBE_COOKIES_FILE = String(process.env.YOUTUBE_COOKIES_FILE || '/app/config/youtube-cookies.txt').trim();
const YOUTUBE_COOKIES_B64 = String(process.env.YOUTUBE_COOKIES_B64 || '').trim();
const SOCIAL_USER_AGENT = String(process.env.YTDLP_USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36').trim();

function validateUrl(raw) {
  const value = String(raw || '').trim();
  if (!value || value.length > 4096) throw new Error('A valid URL is required.');
  let u;
  try { u = new URL(value); } catch { throw new Error('Invalid URL.'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only HTTP and HTTPS URLs are supported.');
  if (u.username || u.password) throw new Error('Credential-bearing URLs are not allowed.');
  return u;
}

function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return false;
  const [a,b] = parts;
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a >= 224);
}

function isPrivateIPv6(ip) {
  const x = ip.toLowerCase();
  return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80:') || x.startsWith('ff');
}

async function assertPublicHost(url) {
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) throw new Error('Local/private hosts are not allowed.');
  if (net.isIP(hostname)) {
    if ((net.isIP(hostname) === 4 && isPrivateIPv4(hostname)) || (net.isIP(hostname) === 6 && isPrivateIPv6(hostname))) throw new Error('Private IP addresses are not allowed.');
    return;
  }
  const records = await dns.lookup(hostname, { all: true });
  if (!records.length) throw new Error('Unable to resolve URL host.');
  for (const record of records) {
    if ((record.family === 4 && isPrivateIPv4(record.address)) || (record.family === 6 && isPrivateIPv6(record.address))) throw new Error('URL resolves to a private IP address.');
  }
}

async function prepareYoutubeCookies() {
  if (!YOUTUBE_COOKIES_B64) return null;
  try {
    await fs.mkdir(path.dirname(YOUTUBE_COOKIES_FILE), { recursive: true });
    const decoded = Buffer.from(YOUTUBE_COOKIES_B64, 'base64');
    if (!decoded.length) throw new Error('YOUTUBE_COOKIES_B64 is empty.');
    await fs.writeFile(YOUTUBE_COOKIES_FILE, decoded, { mode: 0o600 });
    return YOUTUBE_COOKIES_FILE;
  } catch (error) {
    throw new Error(`Unable to prepare YouTube cookies: ${error.message}`);
  }
}

function cookieArgs(cookieFile) {
  return cookieFile ? ['--cookies', cookieFile] : [];
}

function hostPlatform(url) {
  const h = url.hostname.toLowerCase().replace(/^www\./, '');
  if (h === 'tiktok.com' || h.endsWith('.tiktok.com')) return 'tiktok';
  if (h === 'instagram.com' || h.endsWith('.instagram.com') || h === 'instagr.am') return 'instagram';
  if (h === 'twitter.com' || h.endsWith('.twitter.com') || h === 'x.com' || h.endsWith('.x.com')) return 'twitter';
  if (h === 'snapchat.com' || h.endsWith('.snapchat.com')) return 'snapchat';
  if (h === 'facebook.com' || h.endsWith('.facebook.com') || h === 'fb.watch' || h === 'fb.com') return 'facebook';
  if (h === 'pinterest.com' || h.endsWith('.pinterest.com') || h === 'pin.it') return 'pinterest';
  return null;
}

function socialRuntimeArgs(url) {
  const platform = hostPlatform(url);
  const args = ['--user-agent', SOCIAL_USER_AGENT, '--add-header', 'Accept-Language:en-US,en;q=0.9'];
  // These are intentionally conservative: they improve browser-like requests without
  // attempting to bypass authentication, private content, DRM, or access controls.
  if (platform === 'instagram') args.push('--referer', 'https://www.instagram.com/');
  if (platform === 'tiktok') args.push('--referer', 'https://www.tiktok.com/', '--add-header', 'Origin:https://www.tiktok.com', '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8');
  if (platform === 'twitter') args.push('--referer', 'https://x.com/');
  if (platform === 'snapchat') args.push('--referer', 'https://www.snapchat.com/');
  if (platform === 'facebook') args.push('--referer', 'https://www.facebook.com/');
  return args;
}

function ytDlpRuntimeArgs() {
  const args = [];
  if (JS_RUNTIMES) args.push('--js-runtimes', JS_RUNTIMES);
  if (POT_URL) args.push('--extractor-args', `youtubepot-bgutilhttp:base_url=${POT_URL}`);
  if (YOUTUBE_CLIENTS) args.push('--extractor-args', `youtube:player-client=${YOUTUBE_CLIENTS}`);
  return args;
}

function run(args, { cwd, timeoutMs = TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(YTDLP_BIN, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = ''; let settled = false;
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish(new Error('yt-dlp timed out.')); }, timeoutMs);
    const finish = (err, value) => { if (settled) return; settled = true; clearTimeout(timer); err ? reject(err) : resolve(value); };
    child.stdout.on('data', d => { stdout += d.toString(); if (stdout.length > 8 * 1024 * 1024) child.kill('SIGKILL'); });
    child.stderr.on('data', d => { stderr += d.toString(); if (stderr.length > 2 * 1024 * 1024) stderr = stderr.slice(-2 * 1024 * 1024); });
    child.on('error', err => finish(err));
    child.on('close', code => code === 0 ? finish(null, { stdout, stderr }) : finish(new Error(stderr.trim() || `yt-dlp exited with code ${code}`)));
  });
}

async function ensureTool() {
  try { const { stdout } = await run(['--version'], { timeoutMs: 10000 }); return stdout.trim(); }
  catch (error) { throw new Error(`yt-dlp is unavailable (${YTDLP_BIN}): ${error.message}`); }
}

async function inspect(rawUrl, mode = 'info') {
  const url = validateUrl(rawUrl); await assertPublicHost(url); await ensureTool();
  const cookieFile = url.hostname.toLowerCase().endsWith('youtube.com') || url.hostname.toLowerCase() === 'youtu.be' ? await prepareYoutubeCookies() : null;
  const args = ['--ignore-config', '--no-playlist', '--no-warnings', '--dump-single-json', '--skip-download', '--force-ipv4', '--retries', '3', '--fragment-retries', '3', ...ytDlpRuntimeArgs(), ...socialRuntimeArgs(url), ...cookieArgs(cookieFile)];
  if (IMPERSONATE_TARGET) args.push('--impersonate', IMPERSONATE_TARGET);
  args.push('--', url.toString());
  const { stdout } = await run(args);
  let data; try { data = JSON.parse(stdout); } catch { throw new Error('yt-dlp returned invalid metadata.'); }
  const formats = (data.formats || []).map(f => ({ format_id:f.format_id, ext:f.ext, resolution:f.resolution || null, width:f.width || null, height:f.height || null, fps:f.fps || null, vcodec:f.vcodec, acodec:f.acodec, filesize:f.filesize || f.filesize_approx || null, tbr:f.tbr || null, abr:f.abr || null, vbr:f.vbr || null, url: mode === 'formats' ? f.url : undefined })).filter(f => f.format_id);
  return {
    id: data.id || null, title: data.title || null, description: data.description || null,
    uploader: data.uploader || data.channel || null, duration: data.duration || null,
    thumbnail: data.thumbnail || null, webpage_url: data.webpage_url || url.toString(),
    extractor: data.extractor_key || data.extractor || null, upload_date: data.upload_date || null,
    view_count: data.view_count || null, formats: mode === 'formats' ? formats : undefined
  };
}

async function download(rawUrl, type, quality) {
  const url = validateUrl(rawUrl); await assertPublicHost(url); await ensureTool();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zuko-ytdlp-'));
  const token = crypto.randomBytes(8).toString('hex');
  const template = path.join(dir, `${token}.%(ext)s`);
  const format = type === 'audio' ? 'bestaudio/best' : (quality === 'audio' ? 'bestaudio/best' : (quality && /^\d{3,4}$/.test(String(quality)) ? `bestvideo[height<=${quality}]+bestaudio/best[height<=${quality}]/best[height<=${quality}]/best` : 'bestvideo+bestaudio/best'));
  const cookieFile = url.hostname.toLowerCase().endsWith('youtube.com') || url.hostname.toLowerCase() === 'youtu.be' ? await prepareYoutubeCookies() : null;
  const args = ['--ignore-config', '--no-playlist', '--no-part', '--no-continue', '--force-overwrites', '--no-mtime', '--restrict-filenames', '--max-filesize', String(MAX_FILE_BYTES), '--force-ipv4', '--retries', '3', '--fragment-retries', '3', ...ytDlpRuntimeArgs(), ...socialRuntimeArgs(url), ...cookieArgs(cookieFile)];
  if (IMPERSONATE_TARGET) args.push('--impersonate', IMPERSONATE_TARGET);
  args.push('-f', format, '-o', template);
  if (type === 'audio') args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
  else args.push('--merge-output-format', 'mp4');
  args.push('--', url.toString());
  try {
    let firstError = null;
    try {
      await run(args, { cwd: dir, timeoutMs: TIMEOUT_MS });
    } catch (error) {
      firstError = error;
      // Some sites reject the impersonation profile even though their extractor works.
      // Retry once with the same public URL and browser-like headers, but without
      // --impersonate. Never add cookies or authentication for social URLs.
      const retryArgs = args.filter((v, i) => v !== '--impersonate' && (i === 0 || args[i - 1] !== '--impersonate'));
      if (retryArgs.join(' ') === args.join(' ')) throw error;
      await run(retryArgs, { cwd: dir, timeoutMs: Math.min(TIMEOUT_MS, 90000) });
    }
    const files = (await fs.readdir(dir)).filter(name => !name.endsWith('.part') && !name.endsWith('.ytdl'));
    if (!files.length) throw new Error('yt-dlp completed without producing a file.');
    const filename = files[0];
    const filepath = path.join(dir, filename);
    const stat = await fs.stat(filepath);
    if (stat.size > MAX_FILE_BYTES) throw new Error('Downloaded file exceeds the configured size limit.');

    // Never return an HTML challenge/error page as media. This is especially
    // important for TikTok, which can occasionally answer with a webpage even
    // when yt-dlp exits successfully.
    const handle = await fs.open(filepath, 'r');
    try {
      const probe = Buffer.alloc(Math.min(4096, stat.size));
      const { bytesRead } = await handle.read(probe, 0, probe.length, 0);
      const head = probe.subarray(0, bytesRead).toString('utf8').trimStart().toLowerCase();
      if (head.startsWith('<!doctype html') || head.startsWith('<html') || head.includes('<html')) {
        throw new Error('TikTok returned an HTML page instead of media. The public post may be blocked or require a different extractor.');
      }
    } finally {
      await handle.close();
    }
    return { dir, filepath, filename, size: stat.size, cleanup: () => fs.rm(dir, { recursive:true, force:true }) };
  } catch (error) { await fs.rm(dir, { recursive:true, force:true }); throw error; }
}

module.exports = { inspect, download, ensureTool, MAX_FILE_BYTES, IMPERSONATE_TARGET, JS_RUNTIMES, YTDLP_YOUTUBE_CLIENTS: YOUTUBE_CLIENTS, YOUTUBE_COOKIES_FILE: YOUTUBE_COOKIES_FILE };
