# ZUKO API — Endpoint Plugin System

ZUKO endpoints now work like **bot commands/plugins**.

You create one JavaScript file, export an endpoint object, and ZUKO automatically loads it. You do not need to edit `server.js` or a central route list.

## The simple workflow

```text
create file
   ↓
export endpoint
   ↓
write execute() logic
   ↓
npm run check
   ↓
restart ZUKO
   ↓
your endpoint is live
```

## Where to put endpoints

```text
api/
└── endpoints/
    ├── ai/
    ├── download/
    ├── media/
    ├── search/
    └── tools/
```

Create any category you want.

Examples:

```text
api/endpoints/download/tiktok.js
api/endpoints/ai/chat.js
api/endpoints/media/convert.js
api/endpoints/search/movie.js
api/endpoints/tools/qr.js
```

## Fastest way: generate a plugin

From the `api` folder:

```bash
npm run new:endpoint -- tools hello
```

This creates:

```text
api/endpoints/tools/hello.js
```

You can use any category and endpoint name:

```bash
npm run new:endpoint -- download tiktok
npm run new:endpoint -- ai my-chat
npm run new:endpoint -- search movie
```

Then edit the generated `execute()` function.

## The endpoint format

A minimal endpoint looks like this:

```js
'use strict';

module.exports = {
  name: 'Hello',
  method: 'GET',
  path: '/v1/tools/hello',
  category: 'Tools',
  description: 'Return a greeting.',

  async execute({ query, body, params, req, ctx }) {
    const name = ctx.cleanString(query.name || 'Developer', 80);

    return {
      status: true,
      message: `Hello ${name} 👋`
    };
  }
};
```

That's it.

### Available values

`execute()` receives:

```js
{
  query,   // GET query parameters
  body,    // parsed JSON body
  params,  // Express route parameters
  req,     // Express request
  res,     // Express response
  ctx      // ZUKO platform helpers
}
```

Useful `ctx` helpers include:

```js
ctx.API_PREFIX
ctx.API_NAME
ctx.nowIso()
ctx.cleanString(value, maxLength)
ctx.sendResult(...)
```

## GET example

File:

```text
api/endpoints/tools/uuid.js
```

```js
'use strict';

const crypto = require('crypto');

module.exports = {
  name: 'UUID Generator',
  method: 'GET',
  path: '/v1/tools/uuid',
  category: 'Tools',
  description: 'Generate a UUID.',

  async execute() {
    return {
      status: true,
      uuid: crypto.randomUUID()
    };
  }
};
```

The route automatically becomes:

```text
GET /v1/tools/uuid
```

## POST example

```js
'use strict';

module.exports = {
  name: 'Word Counter',
  method: 'POST',
  path: '/v1/tools/word-count',
  category: 'Tools',
  description: 'Count words in supplied text.',

  async execute({ body }) {
    const text = String(body.text || '').trim();

    if (!text) {
      return {
        statusCode: 400,
        data: {
          status: false,
          error: 'text is required'
        }
      };
    }

    return {
      status: true,
      words: text.split(/\s+/).length
    };
  }
};
```

## Route parameters

You can use normal Express parameters:

```js
path: '/v1/users/:id'
```

Then:

```js
async execute({ params }) {
  return {
    status: true,
    userId: params.id
  };
}
```

## Calling your endpoint

After restarting:

```bash
npm run check
npm start
```

Then:

```bash
curl -H "Authorization: Bearer YOUR_ZUKO_KEY"   "http://localhost:3000/v1/tools/hello?name=ZUKO"
```

## ZUKO automatically handles the platform layer

Every endpoint mounted under `/v1/` automatically passes through ZUKO's API-key middleware.

That means you don't need to implement these inside every plugin:

- API-key authentication
- active-key checks
- plan quota
- per-key rate limiting
- concurrency limits
- usage counting
- request logging
- common API security headers

Your plugin should concentrate on **what the endpoint actually does**.

## How to return errors

Use:

```js
return {
  statusCode: 400,
  data: {
    status: false,
    error: 'Something is wrong'
  }
};
```

For success:

```js
return {
  status: true,
  result: 'Everything worked'
};
```

## Taking full control of the response

For special cases such as streaming or a file response, you can use `res`:

```js
async execute({ res }) {
  res.type('text/plain').send('ZUKO');
}
```

When `res.headersSent` is true, the loader will not send another JSON response.

## Important

Do not put a third-party API call in every endpoint just to make the endpoint work.

If you build a downloader, converter, search engine, AI feature, etc., keep the public contract as a **ZUKO endpoint** and put the actual implementation in your own code/modules.

Libraries are fine. Your endpoint should not simply become a proxy whose main job is forwarding another service's API.

## Legacy compatibility

The older format:

```js
module.exports = {
  definition,
  register
};
```

is still supported so existing ZUKO endpoint files don't suddenly break.

For new endpoints, use the simpler command/plugin-style format shown above.

## Endpoint discovery

The loader scans:

```text
api/endpoints/
```

recursively.

You can therefore have:

```text
endpoints/
├── ai/
│   ├── chat.js
│   └── vision.js
├── download/
│   ├── youtube.js
│   └── tiktok.js
├── media/
│   └── convert.js
├── search/
│   └── movie.js
└── tools/
    ├── hello.js
    ├── hash.js
    └── uuid.js
```

No central route registration is necessary.

## Before deployment

Run:

```bash
npm run check
```

Then:

```bash
npm start
```

For Railway, commit the new endpoint file and deploy normally.

---

### Think of it exactly like your bot

Bot:

```text
commands/play.js
        ↓
export command
        ↓
bot loader
        ↓
.play
```

ZUKO:

```text
api/endpoints/download/tiktok.js
        ↓
export endpoint
        ↓
ZUKO endpoint loader
        ↓
GET /v1/download/tiktok
```

That is the intended development experience for ZUKO API v3.
