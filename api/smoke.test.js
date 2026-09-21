'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const API_DIR = __dirname;
const server = fs.readFileSync(path.join(API_DIR, 'server.js'), 'utf8');
const loader = fs.readFileSync(path.join(API_DIR, 'endpoint-loader.js'), 'utf8');

const checks = [
  ['console root route', "app.get('/', sendConsole)"],
  ['email registration', "app.post('/auth/register'"],
  ['email login', "app.post('/auth/login'"],
  ['email verification page', "app.get('/auth/verify'"],
  ['email verification submit', "app.post('/auth/verify'"],
  ['resend verification', "app.post('/auth/resend-verification'"],
  ['Resend mailer', "new Resend(RESEND_API_KEY)"],
  ['session check', "app.get('/auth/me'"],
  ['logout', "app.post('/auth/logout'"],
  ['endpoint loader import', "require('./endpoint-loader')"],
  ['endpoint mount', 'mountEndpoints(app'],
  ['API key auth', 'requireApiKey'],
  ['payment approval', '/admin/api/payments/:reference/approve'],
  ['payment rejection', '/admin/api/payments/:reference/reject'],
  ['endpoint manager', '/admin/api/endpoints'],
  ['users table', 'CREATE TABLE IF NOT EXISTS users'],
  ['API keys table', 'CREATE TABLE IF NOT EXISTS api_keys'],
  ['subscriptions table', 'CREATE TABLE IF NOT EXISTS subscriptions'],
  ['payments table', 'CREATE TABLE IF NOT EXISTS payments']
];

for (const [name, needle] of checks) {
  if (!server.includes(needle)) throw new Error(`Missing ${name}: ${needle}`);
}

for (const file of ['public/dashboard.html', 'public/admin.html', 'public/docs.html']) {
  if (!fs.existsSync(path.join(API_DIR, file))) throw new Error(`Missing ${file}`);
}

// Verify the endpoint loader discovers every endpoint file without starting
// the server or connecting to PostgreSQL.
const endpointLoader = require('./endpoint-loader');
const files = endpointLoader.loadEndpointModules(path.join(API_DIR, 'endpoints'));
if (!files.length) throw new Error('No endpoint modules discovered');

for (const file of ['public/dashboard.html', 'public/admin.html']) {
  const html = fs.readFileSync(path.join(API_DIR, file), 'utf8');
  if (/\bprompt\s*\(/i.test(html)) throw new Error(`Browser prompt() remains in ${file}`);
}

const expected = [
  'endpoints/core/ping.js',
  'endpoints/download/audio.js',
  'endpoints/download/formats.js',
  'endpoints/download/info.js',
  'endpoints/download/video.js',
  'endpoints/download/social.js',
  'endpoints/download/tiktok.js',
  'endpoints/download/instagram.js',
  'endpoints/download/facebook.js',
  'endpoints/download/twitter.js',
  'endpoints/download/pinterest.js'
];
for (const rel of expected) {
  if (!files.includes(path.join(API_DIR, rel))) {
    throw new Error(`Endpoint loader did not discover ${rel}`);
  }
}

// Syntax-check every discovered endpoint without requiring it. This keeps the
// smoke test dependency-light and avoids requiring optional endpoint packages
// (for example yt-search) merely to validate the loader.
const { spawnSync } = require('child_process');
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Syntax error in endpoint ${path.relative(API_DIR, file)}\n${result.stderr || result.stdout}`);
  }
}

console.log(`ZUKO API smoke checks: PASS (${files.length} endpoint modules discovered)`);
