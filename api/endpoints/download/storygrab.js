'use strict';

const snapchat = require('./snapchat');

module.exports = {
  ...snapchat,
  name: 'Snapchat via StoryGrab',
  path: '/v1/download/storygrab',
  description: 'Alias of /v1/download/snapchat (StoryGrab primary).',
};
