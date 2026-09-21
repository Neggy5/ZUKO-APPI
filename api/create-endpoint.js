'use strict';

const fs = require('fs');
const path = require('path');

const category = String(process.argv[2] || '').trim().toLowerCase();
const slug = String(process.argv[3] || '').trim().toLowerCase();

if (!category || !slug || !/^[a-z0-9][a-z0-9_-]*$/.test(category) || !/^[a-z0-9][a-z0-9_-]*$/.test(slug)) {
  console.error('Usage: npm run new:endpoint -- <category> <name>');
  console.error('Example: npm run new:endpoint -- tools hello');
  process.exit(1);
}

const display = slug.split(/[-_]+/).map(x => x.charAt(0).toUpperCase() + x.slice(1)).join(' ');
const dir = path.join(__dirname, 'endpoints', category);
const file = path.join(dir, `${slug}.js`);

if (fs.existsSync(file)) {
  console.error(`Endpoint already exists: ${path.relative(process.cwd(), file)}`);
  process.exit(1);
}

fs.mkdirSync(dir, { recursive: true });

const code = `'use strict';

/**
 * ZUKO endpoint: ${display}
 * Edit execute() to add your own logic.
 * No provider/API wrapper is required.
 */
module.exports = {
  name: '${display}',
  method: 'GET',
  path: '/v1/${category}/${slug}',
  category: '${displayCategory(category)}',
  description: 'Describe what this endpoint does.',

  async execute({ query, body, params, req, ctx }) {
    // Your endpoint logic goes here.
    // query = URL query parameters
    // body  = JSON request body
    // params = route parameters
    // req   = Express request
    // ctx   = ZUKO helpers

    return {
      status: true,
      message: 'Your ${display} endpoint is working.',
      data: {
        query,
        body,
        params
      }
    };
  }
};
`;

function displayCategory(value) {
  return value.split(/[-_]+/).map(x => x.charAt(0).toUpperCase() + x.slice(1)).join(' ');
}
fs.writeFileSync(file, code);
console.log(`Created: ${path.relative(process.cwd(), file)}`);
console.log('Edit the execute() function, then run: npm run check && npm start');
