# ZUKO API — Adding Endpoints

The API is intentionally simple: add a route under `api/server.js`, keep provider-specific code in a helper/module, validate inputs, and return the same JSON shape.

## 1. Add a provider/helper

Create a module such as `api/providers/example.js`:

```js
'use strict';
const axios = require('axios');

async function getExample(query) {
  const { data } = await axios.get('https://example.com/api', {
    params: { q: query },
    timeout: 10000
  });
  return data;
}

module.exports = { getExample };
```

## 2. Import it in `api/server.js`

```js
const { getExample } = require('./providers/example');
```

## 3. Add the route

```js
app.get(`${API_PREFIX}/tools/example`, async (req, res, next) => {
  const started = Date.now();
  try {
    const query = cleanString(req.query.q, 300);
    if (!query) {
      return sendResult(res, req, started, 400, {
        status: false,
        error: 'q is required'
      });
    }

    const result = await getExample(query);

    return sendResult(res, req, started, 200, {
      status: true,
      result
    });
  } catch (err) {
    next(err);
  }
});
```

Because the route is below `app.use('/v1/', requireApiKey)`, it automatically gets API-key authentication, quota accounting, and request logging.

## 4. Add it to the public endpoint catalog

Update the `/v1` endpoint list in `api/server.js`:

```js
{ method: 'GET', path: '/v1/tools/example', auth: true }
```

Also add it to the endpoint map in `api/public/admin.html` if you want it visible in the dashboard.

## 5. Test locally

```bash
cd api
npm install
npm run check
npm start
```

Then:

```bash
curl -H "Authorization: Bearer zuko_xxx" \
  "http://localhost:3000/v1/tools/example?q=hello"
```

## Rules for stable endpoints

- Keep secrets in environment variables.
- Never expose upstream API keys to clients.
- Validate and length-limit every input.
- Give provider calls a timeout.
- Return `{ status: true, ... }` for success and `{ status: false, error: ... }` for failures.
- Use `sendResult()` so usage and request logs stay consistent.
- Keep provider parsing outside the route when it becomes non-trivial.
- Never make clients depend directly on an upstream provider's response schema.

## Recommended structure as the API grows

```text
api/
├── server.js
├── providers/
│   ├── ai/
│   ├── download/
│   ├── search/
│   └── tools/
├── public/
│   ├── admin.html
│   └── docs.html
└── ENDPOINT_GUIDE.md
```

This lets you replace an upstream provider without changing the public ZUKO endpoint contract.
