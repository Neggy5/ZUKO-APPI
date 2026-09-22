'use strict';

const { spawn } = require('child_process');
const fs = require('fs/promises');
const fsSync = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');

const YTDLP_BIN = process.env.YTDLP_BIN || 'yt-dlp';
const MAX_FILE_BYTES = Number(process.env.YTDLP_MAX_FILE_BYTES || 100 * 1024 * 1024);
const TIMEOUT_MS = Number(process.env.YTDLP_TIMEOUT_MS || 120000);
const IMPERSONATE_TARGET = String(process.env.YTDLP_IMPERSONATE || 'Chrome-131:Android-14').trim();
const JS_RUNTIMES = String(process.env.YTDLP_JS_RUNTIMES || 'node').trim();
const POT_SCRIPT = String(process.env.YTDLP_POT_SCRIPT || '/opt/bgutil-ytdlp-pot-provider/server/build/generate_once.js').trim();
const YOUTUBE_CLIENTS = String(process.env.YTDLP_YOUTUBE_CLIENTS || 'default,mweb,web_safari').trim();

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

function ytDlpRuntimeArgs() {
  const args = [];
  if (JS_RUNTIMES) args.push('--js-runtimes', JS_RUNTIMES);
  if (POT_SCRIPT) args.push('--extractor-args', `youtubepot-bgutilscript:script_path=${POT_SCRIPT}`);
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
  catch { throw new Error('yt-dlp is not installed or is not executable on this server.'); }
}

async function inspect(rawUrl, mode = 'info') {
  const url = validateUrl(rawUrl); await assertPublicHost(url); await ensureTool();
  const args = ['--ignore-config', '--no-playlist', '--no-warnings', '--dump-single-json', '--skip-download', '--force-ipv4', '--retries', '3', '--fragment-retries', '3', ...ytDlpRuntimeArgs()];
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
  const args = ['--ignore-config', '--no-playlist', '--no-part', '--no-continue', '--force-overwrites', '--no-mtime', '--restrict-filenames', '--max-filesize', String(MAX_FILE_BYTES), '--force-ipv4', '--retries', '3', '--fragment-retries', '3', ...ytDlpRuntimeArgs()];
  if (IMPERSONATE_TARGET) args.push('--impersonate', IMPERSONATE_TARGET);
  args.push('-f', format, '-o', template);
  if (type === 'audio') args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
  else args.push('--merge-output-format', 'mp4');
  args.push('--', url.toString());
  try {
    await run(args, { cwd: dir, timeoutMs: TIMEOUT_MS });
    const files = (await fs.readdir(dir)).filter(name => !name.endsWith('.part') && !name.endsWith('.ytdl'));
    if (!files.length) throw new Error('yt-dlp completed without producing a file.');
    const filename = files[0]; const filepath = path.join(dir, filename); const stat = await fs.stat(filepath);
    if (stat.size > MAX_FILE_BYTES) throw new Error('Downloaded file exceeds the configured size limit.');
    return { dir, filepath, filename, size: stat.size, cleanup: () => fs.rm(dir, { recursive:true, force:true }) };
  } catch (error) { await fs.rm(dir, { recursive:true, force:true }); throw error; }
}

module.exports = { inspect, download, ensureTool, MAX_FILE_BYTES, IMPERSONATE_TARGET, JS_RUNTIMES };
