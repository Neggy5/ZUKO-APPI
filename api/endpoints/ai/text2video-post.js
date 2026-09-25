'use strict';

const getHandler = require('./text2video');

module.exports = {
  ...getHandler,
  name: 'Text to Video POST',
  method: 'POST',
  path: '/v1/ai/text2video',
  async execute({ query, body }) {
    const merged = { ...query, ...(body || {}) };
    return getHandler.execute({ query: merged });
  },
};
