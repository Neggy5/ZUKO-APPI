'use strict';

/**
 * ZUKO endpoint loader.
 *
 * Preferred plugin format:
 * module.exports = {
 *   name: 'My Endpoint',
 *   method: 'GET',
 *   path: '/v1/tools/my-endpoint',
 *   category: 'Tools',
 *   description: 'What it does.',
 *   async execute({ req, query, body, params, res, ctx }) {
 *     return { status: true, result: 'hello' };
 *   }
 * };
 *
 * Legacy { definition, register } modules are still supported.
 */
const fs = require('fs');
const path = require('path');

const HTTP_METHODS = new Set(['GET','POST','PUT','PATCH','DELETE']);

function loadEndpointModules(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...loadEndpointModules(full));
    else if (entry.isFile() && entry.name.endsWith('.js') && entry.name !== 'index.js') out.push(full);
  }
  return out;
}

function normalizeDefinition(mod) {
  if (mod?.definition && typeof mod.register === 'function') return mod.definition;
  if (!mod || typeof mod.execute !== 'function') return null;
  return {
    name: mod.name,
    method: String(mod.method || 'GET').toUpperCase(),
    path: mod.path,
    category: mod.category || 'General',
    description: mod.description || ''
  };
}

function mountExecuteModule(app, mod, ctx, definition) {
  const method = definition.method.toLowerCase();
  if (!HTTP_METHODS.has(definition.method)) throw new Error(`Unsupported HTTP method in ${definition.path}`);
  if (!definition.path || !definition.path.startsWith(ctx.API_PREFIX + '/')) {
    throw new Error(`Endpoint path must start with ${ctx.API_PREFIX}/: ${definition.path}`);
  }

  app[method](definition.path, async (req, res, next) => {
    const started = Date.now();
    try {
      const result = await mod.execute({
        req,
        res,
        query: req.query || {},
        body: req.body || {},
        params: req.params || {},
        ctx
      });

      // An endpoint may take full control of the response.
      if (res.headersSent) return;

      const statusCode = Number(result?.statusCode || 200);
      const payload = result?.data !== undefined ? result.data : result;
      return ctx.sendResult(res, req, started, statusCode, payload);
    } catch (error) {
      // Keep the platform response consistent while allowing Express error handling.
      if (res.headersSent) return;
      return next(error);
    }
  });
}

function mountEndpoints(app, ctx) {
  const files = loadEndpointModules(path.join(__dirname, 'endpoints'));
  const definitions = [];
  const seen = new Set();

  for (const file of files) {
    delete require.cache[require.resolve(file)];
    const mod = require(file);
    const definition = normalizeDefinition(mod);
    if (!definition) continue;

    definition.method = String(definition.method || 'GET').toUpperCase();
    const key = `${definition.method} ${definition.path}`;

    // Do not bring the entire API down because a stale/duplicate endpoint
    // file exists in the deployment context. Keep the first discovered
    // implementation and skip later duplicates.
    if (seen.has(key)) {
      console.warn(`[endpoint-loader] Skipping duplicate endpoint ${key} from ${path.relative(__dirname, file)}`);
      continue;
    }
    seen.add(key);

    if (mod?.definition && typeof mod.register === 'function') {
      mod.register(app, ctx);
    } else {
      mountExecuteModule(app, mod, ctx, definition);
    }

    definitions.push({
      name: definition.name || definition.path,
      method: definition.method,
      path: definition.path,
      category: definition.category || 'General',
      description: definition.description || '',
      source: path.relative(__dirname, file)
    });
  }

  return definitions.sort((a,b) =>
    `${a.category}/${a.name}`.localeCompare(`${b.category}/${b.name}`)
  );
}

module.exports = { mountEndpoints, loadEndpointModules };
