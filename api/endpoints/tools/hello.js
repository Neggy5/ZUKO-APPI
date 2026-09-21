'use strict';

/**
 * Example ZUKO endpoint.
 * Delete this file when you are ready to create your own endpoint.
 */
module.exports = {
  name: 'Hello',
  method: 'GET',
  path: '/v1/tools/hello',
  category: 'Tools',
  description: 'Simple first-party example endpoint.',

  async execute({ query, ctx }) {
    const name = ctx.cleanString(query.name || 'Developer', 80) || 'Developer';

    return {
      status: true,
      message: `Hello ${name} 👋`,
      service: ctx.API_NAME
    };
  }
};
