'use strict';

const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const axios = require('axios');
const { Pool } = require('pg');
const yts = require('yt-search');
const bcrypt = require('bcryptjs');
const { mountEndpoints } = require('./endpoint-loader');

const PORT = Number(process.env.PORT || 3000);
const API_PREFIX = '/v1';
const ADMIN_PASSWORD = String(process.env.ZUKO_ADMIN_PASSWORD || '');
const ADMIN_SECRET = String(process.env.ZUKO_ADMIN_SECRET || '');
const DATABASE_URL = String(process.env.DATABASE_URL || '');
const API_NAME = process.env.API_NAME || 'ZUKO API';
const API_VERSION = process.env.API_VERSION || '1.0.0';
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const SESSION_SECRET = String(process.env.SESSION_SECRET || ADMIN_SECRET);
const API_IP_WINDOW_MS = Number(process.env.API_IP_WINDOW_MS || 60_000);
const API_IP_LIMIT = Number(process.env.API_IP_LIMIT || 180);
const API_KEY_WINDOW_MS = Number(process.env.API_KEY_WINDOW_MS || 60_000);
const API_KEY_LIMIT = Number(process.env.API_KEY_LIMIT || 120);
const MAX_CONCURRENT_PER_KEY = Number(process.env.MAX_CONCURRENT_PER_KEY || 8);
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 256 * 1024);
const SCRAPER_BLOCK_THRESHOLD = Number(process.env.SCRAPER_BLOCK_THRESHOLD || 40);
const suspiciousHits = new Map();
const activeByKey = new Map();

function clientIp(req) { return String(req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, ''); }
function noteSuspicious(req) {
  const ip = clientIp(req); const now = Date.now(); const item = suspiciousHits.get(ip) || { count: 0, reset: now + 10 * 60_000 };
  if (now > item.reset) { item.count = 0; item.reset = now + 10 * 60_000; }
  item.count++; suspiciousHits.set(ip, item); return item.count;
}
function clearSuspicious(req) { const ip = clientIp(req); suspiciousHits.delete(ip); }
function acquireKeySlot(keyId) { const n = activeByKey.get(keyId) || 0; if (n >= MAX_CONCURRENT_PER_KEY) return false; activeByKey.set(keyId, n + 1); return true; }
function releaseKeySlot(keyId) { const n = activeByKey.get(keyId) || 0; if (n <= 1) activeByKey.delete(keyId); else activeByKey.set(keyId, n - 1); }
function isLikelyScraper(req) {
  const ua = String(req.get('user-agent') || '').toLowerCase();
  if (!ua) return true;
  return /(python-requests|python\/|scrapy|aiohttp|httpclient|okhttp|go-http-client|libwww|wget|curl\/)/i.test(ua);
}

if (!DATABASE_URL) throw new Error('DATABASE_URL is required.');
if (!ADMIN_PASSWORD) throw new Error('ZUKO_ADMIN_PASSWORD is required.');
if (!ADMIN_SECRET || ADMIN_SECRET.length < 32) throw new Error('ZUKO_ADMIN_SECRET must be at least 32 characters.');

const pool = new Pool({ connectionString: DATABASE_URL, max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
pool.on('error', (err) => console.error('[postgres] idle client error:', err?.stack || err));

const PLANS = Object.freeze({
  free: { daily: 100, price: 0, durationDays: 0 },
  pro: { daily: 10000, price: Number(process.env.PLAN_PRO_PRICE || 1500), durationDays: 30 },
  ultimate: { daily: 100000, price: Number(process.env.PLAN_ULTIMATE_PRICE || 3000), durationDays: 30 },
  business: { daily: 1000000, price: Number(process.env.PLAN_BUSINESS_PRICE || 5000), durationDays: 30 }
});
const PAYMENT_METHOD = String(process.env.PREMIUM_PAY_METHOD || 'Opay');
const PAYMENT_ACCOUNT_NUMBER = String(process.env.PREMIUM_PAY_NUMBER || '');
const PAYMENT_ACCOUNT_NAME = String(process.env.PREMIUM_PAY_NAME || '');
const BILLING_ADMIN_NUMBER = String(process.env.BILLING_ADMIN_NUMBER || '');
async function getUserSubscription(userId){ const r=await pool.query(`SELECT * FROM subscriptions WHERE user_id=$1 AND status='active' AND expires_at > NOW() ORDER BY expires_at DESC LIMIT 1`,[userId]); return r.rows[0]||null; }
async function effectivePlanForUser(userId){ const sub=await getUserSubscription(userId); return sub?.plan || 'free'; }
function paymentReference(){ return 'ZUKO-' + crypto.randomBytes(4).toString('hex').toUpperCase(); }

function nowIso() { return new Date().toISOString(); }
function sha256(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function randomKey(prefix = 'zuko') { return `${prefix}_${crypto.randomBytes(24).toString('base64url')}`; }
function sign(value) { return crypto.createHmac('sha256', ADMIN_SECRET).update(value).digest('base64url'); }
function makeAdminToken() {
  const payload = Buffer.from(JSON.stringify({ sub: 'admin', exp: Date.now() + 12 * 60 * 60 * 1000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
function validAdminToken(token) {
  try {
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig || sign(payload) !== sig) return false;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.sub === 'admin' && Number(data.exp) > Date.now();
  } catch { return false; }
}
function cleanString(v, max = 500) { return String(v ?? '').trim().slice(0, max); }
function dayKey() { return new Date().toISOString().slice(0, 10); }
function safeEqual(a, b) { const aa=Buffer.from(String(a)); const bb=Buffer.from(String(b)); return aa.length===bb.length && crypto.timingSafeEqual(aa,bb); }
function sessionToken() { return crypto.randomBytes(32).toString('base64url'); }
function sessionCookie(token) { return `zuko_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; ${process.env.NODE_ENV === 'production' ? 'Secure; ' : ''}Max-Age=604800; Path=/`; }
async function createSession(userId) { const raw=sessionToken(); await pool.query('INSERT INTO user_sessions(user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL \'7 days\')',[userId,sha256(raw)]); return raw; }
async function currentUser(req) { const raw=req.cookies?.zuko_session; if(!raw)return null; const r=await pool.query('SELECT u.* FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW()',[sha256(raw)]); return r.rows[0]||null; }
async function userOnly(req,res,next){ try { req.user=await currentUser(req); if(!req.user)return res.status(401).json({status:false,error:'Authentication required.'}); next(); } catch(e){next(e);} }

function validEmail(value) { const email=cleanString(value,254).toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null; }
function passwordValid(value) { const p=String(value||''); return p.length>=8 && p.length<=200; }
function requireSameOrigin(req) { const origin=String(req.get('origin')||''); return !origin || !PUBLIC_BASE_URL || origin===PUBLIC_BASE_URL; }


async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT UNIQUE,
      name TEXT NOT NULL DEFAULT 'Developer',
      avatar TEXT,
      password_hash TEXT,
      email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      free_key_issued_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS user_sessions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash CHAR(64) UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS endpoint_configs (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'GET',
      path TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      description TEXT NOT NULL DEFAULT '',
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS subscriptions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS subscriptions_user_idx ON subscriptions(user_id, expires_at DESC);
    CREATE TABLE IF NOT EXISTS payments (
      id BIGSERIAL PRIMARY KEY,
      reference TEXT UNIQUE NOT NULL,
      user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      plan TEXT NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      currency TEXT NOT NULL DEFAULT 'NGN',
      status TEXT NOT NULL DEFAULT 'pending',
      note TEXT,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      reviewed_by TEXT,
      rejection_reason TEXT
    );
    CREATE INDEX IF NOT EXISTS payments_status_idx ON payments(status, submitted_at DESC);
    CREATE TABLE IF NOT EXISTS api_keys (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      key_hash CHAR(64) UNIQUE NOT NULL,
      key_prefix TEXT NOT NULL,
      owner_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      plan TEXT NOT NULL DEFAULT 'free',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS usage_daily (
      api_key_id BIGINT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
      usage_date DATE NOT NULL,
      requests BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (api_key_id, usage_date)
    );
    CREATE TABLE IF NOT EXISTS request_logs (
      id BIGSERIAL PRIMARY KEY,
      api_key_id BIGINT REFERENCES api_keys(id) ON DELETE SET NULL,
      route TEXT NOT NULL,
      method TEXT NOT NULL,
      status INTEGER NOT NULL,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      ip TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS request_logs_created_at_idx ON request_logs(created_at DESC);
    ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS owner_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
  `);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS free_key_issued_at TIMESTAMPTZ;`);
  await pool.query(`DELETE FROM api_keys WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY owner_user_id ORDER BY created_at ASC, id ASC) rn FROM api_keys WHERE plan='free' AND owner_user_id IS NOT NULL) d WHERE rn > 1);`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS api_keys_one_free_per_user_idx ON api_keys(owner_user_id) WHERE plan='free' AND owner_user_id IS NOT NULL;`);
}

async function getApiKey(raw) {
  if (!raw) return null;
  const token = String(raw).replace(/^Bearer\s+/i, '').trim();
  if (!token.startsWith('zuko_')) return null;
  const result = await pool.query('SELECT * FROM api_keys WHERE key_hash=$1 LIMIT 1', [sha256(token)]);
  return result.rows[0] || null;
}

async function requireApiKey(req, res, next) {
  try {
    const key = await getApiKey(req.get('authorization') || req.get('x-api-key'));
    if (!key || !key.active) { noteSuspicious(req); return res.status(401).json({ status: false, error: 'Invalid or inactive API key.' }); }
    if (isLikelyScraper(req)) { const hits = noteSuspicious(req); if (hits >= SCRAPER_BLOCK_THRESHOLD) return res.status(403).json({ status:false, error:'Automated client blocked. Use an authorized API client with a valid API key.' }); } else { clearSuspicious(req); }
    const keyLimiter = req.app.locals.keyLimiter;
    const allowed = await keyLimiter.check(key.id);
    if (!allowed) return res.status(429).json({ status:false, error:'Per-key rate limit exceeded. Slow down and retry later.' });
    if (!acquireKeySlot(key.id)) return res.status(429).json({ status:false, error:'Too many concurrent requests for this API key.' });
    res.once('finish', () => releaseKeySlot(key.id));
    const plan = PLANS[key.plan] || PLANS.free;
    const usage = await pool.query('SELECT requests FROM usage_daily WHERE api_key_id=$1 AND usage_date=$2', [key.id, dayKey()]);
    const used = Number(usage.rows[0]?.requests || 0);
    if (used >= plan.daily) {
      if (key.plan === 'free') return res.status(429).json({ status: false, error: 'Free API quota exceeded. Upgrade to a paid plan to continue.', plan: 'free', limit: plan.daily, used, upgradeRequired: true, buyUrl: '/dashboard#billing' });
      return res.status(429).json({ status: false, error: 'Daily API quota exceeded.', plan: key.plan, limit: plan.daily, used });
    }
    req.apiKey = key;
    req.usage = { used, limit: plan.daily };
    next();
  } catch (err) { next(err); }
}

async function recordRequest(req, status, started) {
  const latency = Date.now() - started;
  try {
    if (req.apiKey) {
      await pool.query(`INSERT INTO usage_daily(api_key_id, usage_date, requests) VALUES($1,$2,1)
        ON CONFLICT(api_key_id, usage_date) DO UPDATE SET requests=usage_daily.requests+1`, [req.apiKey.id, dayKey()]);
      await pool.query('UPDATE api_keys SET last_used_at=NOW() WHERE id=$1', [req.apiKey.id]);
    }
    await pool.query('INSERT INTO request_logs(api_key_id,route,method,status,latency_ms,ip) VALUES($1,$2,$3,$4,$5,$6)', [req.apiKey?.id || null, req.originalUrl.split('?')[0], req.method, status, latency, req.ip]);
  } catch (err) { console.error('[usage-log]', err.message); }
}

function sendResult(res, req, started, status, payload) {
  void recordRequest(req, status, started);
  return res.status(status).json(payload);
}

async function translate(text, target = 'en', source = 'auto') {
  const q = cleanString(text, 5000);
  if (!q) throw new Error('text is required');
  const response = await axios.get('https://translate.googleapis.com/translate_a/single', {
    params: { client: 'gtx', sl: source || 'auto', tl: target, dt: 't', q }, timeout: 10000
  });
  const chunks = Array.isArray(response.data?.[0]) ? response.data[0] : [];
  const translated = chunks.map(x => x?.[0]).filter(Boolean).join('');
  if (!translated) throw new Error('Translation provider returned no result.');
  return translated;
}

async function aiChat(prompt, model = 'default') {
  const base = String(process.env.AI_API_BASE || '').replace(/\/$/, '');
  const key = String(process.env.AI_API_KEY || '');
  if (!base || !key) throw new Error('AI provider is not configured on this API server.');
  const response = await axios.post(`${base}/chat/completions`, {
    model: model === 'default' ? (process.env.AI_DEFAULT_MODEL || 'default') : model,
    messages: [{ role: 'user', content: cleanString(prompt, 12000) }]
  }, { timeout: 45000, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } });
  const text = response.data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('AI provider returned no text.');
  return { text, model: response.data?.model || model };
}

class KeyRateLimiter {
  constructor(windowMs, limit) { this.windowMs = windowMs; this.limit = limit; this.map = new Map(); }
  async check(id) { const now = Date.now(); const x = this.map.get(id) || { start: now, count: 0 }; if (now - x.start >= this.windowMs) { x.start = now; x.count = 0; } x.count++; this.map.set(id, x); return x.count <= this.limit; }
}

async function main() {
  await migrate();
  const app = express();
  app.locals.keyLimiter = new KeyRateLimiter(API_KEY_WINDOW_MS, API_KEY_LIMIT);
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((req, res, next) => { res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','no-referrer'); if (req.path.startsWith('/v1/')) res.setHeader('Cache-Control','private, no-store'); next(); });
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(x => x.trim()) : true }));
  app.use(express.json({ limit: MAX_BODY_BYTES }));
  app.use((req, _res, next) => { req.cookies = Object.fromEntries(String(req.headers.cookie || '').split(';').map(x => x.trim()).filter(Boolean).map(x => { const i=x.indexOf('='); return [i<0?x:x.slice(0,i), i<0?'':decodeURIComponent(x.slice(i+1))]; })); next(); });
  app.use(rateLimit({ windowMs: API_IP_WINDOW_MS, limit: API_IP_LIMIT, standardHeaders: 'draft-7', legacyHeaders: false, keyGenerator: req => clientIp(req), skip: req => req.path.startsWith('/healthz') || req.path.startsWith('/readyz') }));

  app.get('/healthz', async (_req, res) => {
    try { await pool.query('SELECT 1'); res.json({ status: true, service: API_NAME, version: API_VERSION, time: nowIso() }); }
    catch { res.status(503).json({ status: false, service: API_NAME }); }
  });
  app.get('/readyz', async (_req, res) => { try { await pool.query('SELECT 1'); res.json({ status: true }); } catch { res.status(503).json({ status: false }); } });

  app.use(`${API_PREFIX}/`, requireApiKey);

  // Mount modular endpoints (including /v1/ytmp3 and /v1/ytmp4) after API-key auth.
  const loadedEndpoints = mountEndpoints(app, {
    API_PREFIX,
    sendResult,
    recordRequest,
    cleanString,
    nowIso,
    axios,
    yts,
    pool
  });
  console.log(`[endpoints] mounted ${loadedEndpoints.length} modular endpoints`);

  app.get(`${API_PREFIX}/info`, (req, res) => sendResult(res, req, Date.now(), 200, { status: true, name: API_NAME, version: API_VERSION, plan: req.apiKey.plan, quota: req.usage }));

  app.get(`${API_PREFIX}/search/youtube`, async (req, res, next) => {
    const started = Date.now();
    try {
      const q = cleanString(req.query.q, 300);
      if (!q) return sendResult(res, req, started, 400, { status: false, error: 'q is required' });
      const result = await yts(q);
      const videos = (result.videos || []).slice(0, Math.min(Number(req.query.limit) || 10, 20)).map(v => ({ title: v.title, url: v.url, videoId: v.videoId, duration: v.timestamp, seconds: v.seconds, thumbnail: v.thumbnail, views: v.views, author: v.author?.name || null }));
      return sendResult(res, req, started, 200, { status: true, query: q, results: videos });
    } catch (err) { next(err); }
  });

  app.get(`${API_PREFIX}/tools/translate`, async (req, res, next) => {
    const started = Date.now();
    try {
      const text = cleanString(req.query.text, 5000);
      const target = cleanString(req.query.target || 'en', 20);
      const source = cleanString(req.query.source || 'auto', 20);
      if (!text) return sendResult(res, req, started, 400, { status: false, error: 'text is required' });
      const result = await translate(text, target, source);
      return sendResult(res, req, started, 200, { status: true, source, target, result });
    } catch (err) { next(err); }
  });

  app.post(`${API_PREFIX}/ai/chat`, async (req, res, next) => {
    const started = Date.now();
    try {
      const prompt = cleanString(req.body?.prompt, 12000);
      if (!prompt) return sendResult(res, req, started, 400, { status: false, error: 'prompt is required' });
      const result = await aiChat(prompt, cleanString(req.body?.model || 'default', 100));
      return sendResult(res, req, started, 200, { status: true, result });
    } catch (err) { next(err); }
  });

  app.get('/api', (_req, res) => res.json({
  status: true,
  service: API_NAME,
  version: API_VERSION,
  message: 'ZUKO API is online ⚡',
  health: '/healthz',
  docs: '/docs',
  api: '/v1',
  endpoints: [
    '/v1/info',
    '/v1/search/youtube',
    '/v1/tools/translate',
    '/v1/ai/chat'
  ]
}));

app.get('/api/', (_req, res) => res.json({
  status: true,
  service: API_NAME,
  version: API_VERSION,
  message: 'ZUKO API is online ⚡',
  health: '/healthz',
  docs: '/docs',
  api: '/v1',
  endpoints: [
    '/v1/info',
    '/v1/search/youtube',
    '/v1/tools/translate',
    '/v1/ai/chat'
  ]
}));

  app.get('/admin/api/endpoints', adminOnly, async (_req, res, next) => {
    try {
      const r = await pool.query('SELECT id,name,method,path,category,description,enabled,created_at,updated_at FROM endpoint_configs ORDER BY category,name');
      res.json({ status:true, endpoints:r.rows });
    } catch (err) { next(err); }
  });

  app.post('/admin/api/endpoints', adminOnly, async (req, res, next) => {
    try {
      const name = cleanString(req.body?.name, 100);
      const method = cleanString(req.body?.method || 'GET', 10).toUpperCase();
      const routePath = cleanString(req.body?.path, 180);
      const category = cleanString(req.body?.category || 'General', 60);
      const description = cleanString(req.body?.description || '', 500);
      if (!name || !routePath || !/^\/v1\/[a-z0-9_\/-]+$/.test(routePath)) return res.status(400).json({status:false,error:'Use a valid /v1/... endpoint path.'});
      if (!['GET','POST','PUT','PATCH','DELETE'].includes(method)) return res.status(400).json({status:false,error:'Unsupported HTTP method.'});
      const r = await pool.query('INSERT INTO endpoint_configs(name,method,path,category,description) VALUES($1,$2,$3,$4,$5) RETURNING *',[name,method,routePath,category,description]);
      res.status(201).json({status:true,endpoint:r.rows[0]});
    } catch (err) { if (err.code === '23505') return res.status(409).json({status:false,error:'Endpoint path already exists.'}); next(err); }
  });

  app.post('/admin/api/endpoints/:id/toggle', adminOnly, async (req, res, next) => {
    try { const r=await pool.query('UPDATE endpoint_configs SET enabled=NOT enabled,updated_at=NOW() WHERE id=$1 RETURNING id,enabled',[req.params.id]); if(!r.rowCount)return res.status(404).json({status:false,error:'Endpoint not found.'}); res.json({status:true,endpoint:r.rows[0]}); } catch(err){next(err);}
  });

  app.delete('/admin/api/endpoints/:id', adminOnly, async (req,res,next)=>{
    try { const r=await pool.query('DELETE FROM endpoint_configs WHERE id=$1 RETURNING id',[req.params.id]); if(!r.rowCount)return res.status(404).json({status:false,error:'Endpoint not found.'}); res.json({status:true}); } catch(err){next(err);}
  });


  app.get('/dashboard', (_req,res)=>res.sendFile(path.join(__dirname,'public','dashboard.html')));

  app.post('/auth/register', async (req,res,next)=>{
    if(!requireSameOrigin(req)) return res.status(403).json({status:false,error:'Invalid request origin.'});
    try{
      const name=cleanString(req.body?.name||'Developer',80)||'Developer';
      const email=validEmail(req.body?.email); const password=String(req.body?.password||'');
      if(!email) return res.status(400).json({status:false,error:'A valid email is required.'});
      if(!passwordValid(password)) return res.status(400).json({status:false,error:'Password must be 8-200 characters.'});
      const existing=await pool.query('SELECT id FROM users WHERE email=$1 LIMIT 1',[email]);
      if(existing.rowCount) return res.status(409).json({status:false,error:'An account with that email already exists.'});
      const hash=await bcrypt.hash(password,12);
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
        const created=await client.query('INSERT INTO users(email,name,password_hash,email_verified,free_key_issued_at) VALUES($1,$2,$3,true,NOW()) RETURNING id,email,name,email_verified',[email,name,hash]);
        const userId=created.rows[0].id;
        const raw=randomKey('zuko_live');
        const key=await client.query("INSERT INTO api_keys(name,key_hash,key_prefix,owner_user_id,plan) VALUES($1,$2,$3,$4,'free') RETURNING id,name,key_prefix,plan,active,created_at",[`user:${userId}:Free`,sha256(raw),raw.slice(0,17),userId]);
        await client.query('COMMIT');
        const session=await createSession(userId); res.setHeader('Set-Cookie',sessionCookie(session));
        return res.status(201).json({status:true,user:created.rows[0],key:raw,record:key.rows[0]});
      } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    }catch(e){next(e);}
  });

  app.post('/auth/login', async (req,res,next)=>{
    if(!requireSameOrigin(req)) return res.status(403).json({status:false,error:'Invalid request origin.'});
    try{
      const email=validEmail(req.body?.email); const password=String(req.body?.password||'');
      if(!email||!password) return res.status(400).json({status:false,error:'Email and password are required.'});
      const result=await pool.query('SELECT * FROM users WHERE email=$1 LIMIT 1',[email]); const user=result.rows[0];
      if(!user||!user.password_hash||!(await bcrypt.compare(password,user.password_hash))) return res.status(401).json({status:false,error:'Invalid email or password.'});
      await pool.query('UPDATE users SET last_login_at=NOW() WHERE id=$1',[user.id]);
      const raw=await createSession(user.id); res.setHeader('Set-Cookie',sessionCookie(raw));
      res.json({status:true,user:{id:user.id,email:user.email,name:user.name,avatar:user.avatar,emailVerified:user.email_verified}});
    }catch(e){next(e);}
  });

  app.get('/auth/me', async (req,res,next)=>{ try{ const user=await currentUser(req); if(!user)return res.json({status:true,authenticated:false}); res.json({status:true,authenticated:true,user:{id:user.id,email:user.email,name:user.name,avatar:user.avatar,emailVerified:user.email_verified}}); }catch(e){next(e);} });

  app.post('/auth/logout', async (req,res,next)=>{ try{ const raw=req.cookies?.zuko_session; if(raw) await pool.query('DELETE FROM user_sessions WHERE token_hash=$1',[sha256(raw)]); res.setHeader('Set-Cookie','zuko_session=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/'); res.json({status:true}); }catch(e){next(e);} });
  app.get('/api/ping', (_req,res)=>res.json({status:true,message:'ZUKO API is alive ⚡',time:nowIso()}));
  app.get(`${API_PREFIX}/tools/ping`, (req,res)=>sendResult(res,req,Date.now(),200,{status:true,message:'pong',service:API_NAME,time:nowIso(),plan:req.apiKey.plan}));
  app.get('/dashboard/api/profile', userOnly, async (req,res,next)=>{try{const keys=await pool.query('SELECT id,name,key_prefix,plan,active,created_at,last_used_at FROM api_keys WHERE owner_user_id=$1 ORDER BY id DESC',[req.user.id]);const subscription=await getUserSubscription(req.user.id);res.json({status:true,user:{id:req.user.id,email:req.user.email,name:req.user.name,avatar:req.user.avatar,emailVerified:req.user.email_verified},subscription:subscription?{plan:subscription.plan,status:subscription.status,expiresAt:subscription.expires_at}:null,keys:keys.rows,plans:PLANS,payment:{method:PAYMENT_METHOD,accountNumber:PAYMENT_ACCOUNT_NUMBER,accountName:PAYMENT_ACCOUNT_NAME}});}catch(e){next(e);}});
  app.get('/dashboard/api/payments', userOnly, async (req,res,next)=>{try{const r=await pool.query('SELECT reference,plan,amount,currency,status,note,submitted_at,reviewed_at,rejection_reason FROM payments WHERE user_id=$1 ORDER BY id DESC LIMIT 50',[req.user.id]);res.json({status:true,payments:r.rows});}catch(e){next(e);}});
  app.post('/dashboard/api/payments', userOnly, async (req,res,next)=>{try{const plan=cleanString(req.body?.plan||'',30).toLowerCase();const note=cleanString(req.body?.note||'',500);if(!PLANS[plan]||plan==='free')return res.status(400).json({status:false,error:'Choose a paid plan.'});const ref=paymentReference();const r=await pool.query(
  `INSERT INTO payments
    (reference,user_id,plan,amount,note)
   VALUES ($1,$2,$3,$4,$5)
   RETURNING reference,plan,amount,currency,status,note,submitted_at`,
  [ref,req.user.id,plan,PLANS[plan].price,note]
);
res.status(201).json({
  status:true,
  payment:r.rows[0],
  instructions:{
    method:PAYMENT_METHOD,
    accountNumber:PAYMENT_ACCOUNT_NUMBER,
    accountName:PAYMENT_ACCOUNT_NAME,
    note,
    reference:ref
  }
});}catch(e){next(e);}});
  app.post('/dashboard/api/keys', userOnly, async (req,res,next)=>{try{
    const name=cleanString(req.body?.name||'My App',100);
    const plan=await effectivePlanForUser(req.user.id);
    if(plan==='free'){
      const existing=await pool.query("SELECT id,active,created_at FROM api_keys WHERE owner_user_id=$1 AND plan='free' LIMIT 1",[req.user.id]);
      if(existing.rowCount) return res.status(409).json({status:false,error:'Your free API key has already been issued. It cannot be regenerated. Upgrade to a paid plan for another key.',upgradeRequired:true,plan:'free'});
      const issued=await pool.query('SELECT free_key_issued_at FROM users WHERE id=$1',[req.user.id]);
      if(issued.rows[0]?.free_key_issued_at) return res.status(409).json({status:false,error:'Your one-time free API key has already been issued and cannot be regenerated.',upgradeRequired:true,plan:'free'});
    }
    const raw=randomKey('zuko_live');
    const r=await pool.query('INSERT INTO api_keys(name,key_hash,key_prefix,owner_user_id,plan) VALUES($1,$2,$3,$4,$5) RETURNING id,name,key_prefix,plan,active,created_at',[`user:${req.user.id}:${name}`,sha256(raw),raw.slice(0,17),req.user.id,plan]);
    if(plan==='free') await pool.query('UPDATE users SET free_key_issued_at=COALESCE(free_key_issued_at,NOW()) WHERE id=$1',[req.user.id]);
    res.status(201).json({status:true,key:raw,record:r.rows[0]});
  }catch(e){next(e);}});
  app.post('/dashboard/api/keys/:id/revoke', userOnly, async (req,res,next)=>{try{
    const key=(await pool.query('SELECT id,plan FROM api_keys WHERE id=$1 AND owner_user_id=$2',[req.params.id,req.user.id])).rows[0];
    if(!key)return res.status(404).json({status:false,error:'Key not found.'});
    if(key.plan==='free') return res.status(403).json({status:false,error:'The free API key cannot be revoked. When its quota is exhausted, upgrade to a paid plan.',upgradeRequired:true,plan:'free'});
    const r=await pool.query('UPDATE api_keys SET active=false,revoked_at=NOW() WHERE id=$1 AND owner_user_id=$2 RETURNING id',[req.params.id,req.user.id]);
    res.json({status:true});
  }catch(e){next(e);}});

  app.get('/docs', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'docs.html')));
  app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

  app.post('/admin/api/login', (req, res) => {
    const supplied = Buffer.from(String(req.body?.password || '')); const expected = Buffer.from(ADMIN_PASSWORD); if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return res.status(401).json({ status: false, error: 'Invalid credentials.' });
    res.setHeader('Set-Cookie', `zuko_admin=${encodeURIComponent(makeAdminToken())}; HttpOnly; SameSite=Strict; ${process.env.NODE_ENV === 'production' ? 'Secure; ' : ''}Max-Age=43200; Path=/`);
    res.json({ status: true });
  });

  function adminOnly(req, res, next) {
    if (!validAdminToken(req.cookies?.zuko_admin || req.get('x-admin-token'))) return res.status(401).json({ status: false, error: 'Admin authentication required.' });
    next();
  }

  app.get('/admin/api/metrics', adminOnly, async (_req, res, next) => {
    try {
      const [status, routes, plans] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status >= 200 AND status < 400)::int AS success, COALESCE(AVG(latency_ms),0)::int AS avg_latency FROM request_logs WHERE created_at >= NOW() - INTERVAL '24 hours'`),
        pool.query(`SELECT route, COUNT(*)::bigint AS requests, COALESCE(AVG(latency_ms),0)::int AS avg_latency FROM request_logs WHERE created_at >= NOW() - INTERVAL '24 hours' GROUP BY route ORDER BY requests DESC LIMIT 10`),
        pool.query(`SELECT plan, COUNT(*)::int AS count FROM api_keys GROUP BY plan ORDER BY count DESC`)
      ]);
      const row = status.rows[0];
      res.json({ status: true, last24h: { total: Number(row.total), success: Number(row.success), successRate: row.total ? Number(((row.success / row.total) * 100).toFixed(1)) : 100, avgLatencyMs: Number(row.avg_latency) }, routes: routes.rows.map(x => ({ route:x.route, requests:Number(x.requests), avgLatencyMs:Number(x.avg_latency) })), plans: plans.rows });
    } catch (err) { next(err); }
  });

  app.get('/admin/api/summary', adminOnly, async (_req, res, next) => {
    try {
      const [keys, active, requests, today] = await Promise.all([
        pool.query('SELECT COUNT(*)::int count FROM api_keys'),
        pool.query('SELECT COUNT(*)::int count FROM api_keys WHERE active=true'),
        pool.query('SELECT COALESCE(SUM(requests),0)::bigint count FROM usage_daily'),
        pool.query('SELECT COALESCE(SUM(requests),0)::bigint count FROM usage_daily WHERE usage_date=$1', [dayKey()])
      ]);
      res.json({ status: true, keys: keys.rows[0].count, activeKeys: active.rows[0].count, totalRequests: Number(requests.rows[0].count), todayRequests: Number(today.rows[0].count), plans: PLANS });
    } catch (err) { next(err); }
  });

  app.get('/admin/api/keys', adminOnly, async (_req, res, next) => {
    try {
      const result = await pool.query('SELECT id,name,key_prefix,plan,active,created_at,last_used_at,revoked_at FROM api_keys ORDER BY id DESC LIMIT 500');
      res.json({ status: true, keys: result.rows });
    } catch (err) { next(err); }
  });

  app.post('/admin/api/keys', adminOnly, async (req, res, next) => {
    try {
      const name = cleanString(req.body?.name || 'Developer', 100);
      const plan = cleanString(req.body?.plan || 'free', 30).toLowerCase();
      if (!PLANS[plan]) return res.status(400).json({ status: false, error: 'Invalid plan.' });
      const raw = randomKey();
      const result = await pool.query('INSERT INTO api_keys(name,key_hash,key_prefix,plan) VALUES($1,$2,$3,$4) RETURNING id,name,key_prefix,plan,active,created_at', [name, sha256(raw), raw.slice(0, 13), plan]);
      res.status(201).json({ status: true, key: raw, record: result.rows[0] });
    } catch (err) { next(err); }
  });

  app.post('/admin/api/keys/:id/revoke', adminOnly, async (req, res, next) => {
    try { const r = await pool.query('UPDATE api_keys SET active=false,revoked_at=NOW() WHERE id=$1 RETURNING id', [req.params.id]); if (!r.rowCount) return res.status(404).json({ status:false,error:'Key not found.' }); res.json({ status:true }); }
    catch (err) { next(err); }
  });

  app.get('/admin/api/payments', adminOnly, async (_req,res,next)=>{try{const r=await pool.query(`SELECT p.*,u.email,u.name FROM payments p LEFT JOIN users u ON u.id=p.user_id ORDER BY p.id DESC LIMIT 500`);res.json({status:true,payments:r.rows});}catch(e){next(e);}});
  app.post('/admin/api/payments/:reference/approve', adminOnly, async (req,res,next)=>{const client=await pool.connect();try{await client.query('BEGIN');const p=(await client.query('SELECT * FROM payments WHERE reference=$1 FOR UPDATE',[req.params.reference])).rows[0];if(!p)return res.status(404).json({status:false,error:'Payment not found.'});if(p.status!=='pending')return res.status(409).json({status:false,error:`Payment is already ${p.status}.`});const days=PLANS[p.plan]?.durationDays||30;const current=(await client.query(`SELECT expires_at FROM subscriptions WHERE user_id=$1 AND status='active' AND expires_at>NOW() ORDER BY expires_at DESC LIMIT 1`,[p.user_id])).rows[0];const base=current?.expires_at?new Date(current.expires_at):new Date();const start=new Date();const expiry=new Date(Math.max(base.getTime(),start.getTime())+days*86400000);await client.query(`UPDATE subscriptions SET status='expired',updated_at=NOW() WHERE user_id=$1 AND status='active'`,[p.user_id]);await client.query(`INSERT INTO subscriptions(user_id,plan,status,started_at,expires_at) VALUES($1,$2,'active',$3,$4)`,[p.user_id,p.plan,start,expiry]);await client.query(`UPDATE api_keys SET plan=$2 WHERE owner_user_id=$1 AND active=true`,[p.user_id,p.plan]);await client.query(`UPDATE payments SET status='approved',reviewed_at=NOW(),reviewed_by=$2 WHERE reference=$1`,[p.reference,BILLING_ADMIN_NUMBER||'admin']);await client.query('COMMIT');res.json({status:true,reference:p.reference,plan:p.plan,expiresAt:expiry});}catch(e){await client.query('ROLLBACK');next(e);}finally{client.release();}});
  app.post('/admin/api/payments/:reference/reject', adminOnly, async (req,res,next)=>{try{const reason=cleanString(req.body?.reason||'Payment not received',300);const r=await pool.query(`UPDATE payments SET status='rejected',reviewed_at=NOW(),reviewed_by=$2,rejection_reason=$3 WHERE reference=$1 AND status='pending' RETURNING reference`,[req.params.reference,BILLING_ADMIN_NUMBER||'admin',reason]);if(!r.rowCount)return res.status(404).json({status:false,error:'Pending payment not found.'});res.json({status:true});}catch(e){next(e);}});
  app.get('/admin/api/billing', adminOnly, async (_req,res,next)=>{try{const [rev,pending,active,expired]=await Promise.all([pool.query(`SELECT COALESCE(SUM(amount),0)::numeric total FROM payments WHERE status='approved'`),pool.query(`SELECT COUNT(*)::int count FROM payments WHERE status='pending'`),pool.query(`SELECT COUNT(*)::int count FROM subscriptions WHERE status='active' AND expires_at>NOW()`),pool.query(`SELECT COUNT(*)::int count FROM subscriptions WHERE expires_at<=NOW()`)]);res.json({status:true,revenue:Number(rev.rows[0].total),pending:Number(pending.rows[0].count),activeSubscriptions:Number(active.rows[0].count),expiredSubscriptions:Number(expired.rows[0].count),plans:PLANS,paymentMethod:PAYMENT_METHOD});}catch(e){next(e);}});

  app.get('/admin/api/logs', adminOnly, async (_req, res, next) => {
    try { const r = await pool.query(`SELECT l.id,l.route,l.method,l.status,l.latency_ms,l.ip,l.created_at,k.name,k.plan FROM request_logs l LEFT JOIN api_keys k ON k.id=l.api_key_id ORDER BY l.id DESC LIMIT 100`); res.json({ status:true, logs:r.rows }); }
    catch (err) { next(err); }
  });

  app.use((err, req, res, _next) => {
    console.error('[api]', err?.stack || err);
    if (req.apiKey) void recordRequest(req, 500, Date.now());
    res.status(500).json({ status: false, error: process.env.NODE_ENV === 'production' ? 'Internal server error.' : (err.message || 'Internal server error.') });
  });

  const server = app.listen(PORT, '0.0.0.0', () => console.log(`${API_NAME} ${API_VERSION} listening on :${PORT}`));
  server.keepAliveTimeout = Number(process.env.HTTP_KEEP_ALIVE_TIMEOUT_MS || 65000);
  server.headersTimeout = Number(process.env.HTTP_HEADERS_TIMEOUT_MS || 66000);
  server.requestTimeout = Number(process.env.HTTP_REQUEST_TIMEOUT_MS || 0);

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] received ${signal}`);
    server.close(async () => {
      try { await pool.end(); } catch (err) { console.error('[shutdown] postgres close failed:', err?.stack || err); }
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

main().catch(err => { console.error(err); process.exit(1); });
