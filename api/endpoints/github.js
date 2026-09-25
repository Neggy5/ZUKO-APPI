'use strict';
const { httpGet } = require('../lib/httpGet');
module.exports = {
  name: 'GitHub User', method: 'GET', path: '/v1/github', category: 'Info',
  description: 'GitHub public user profile',
  async execute({ query }) {
    const user = String(query.user || query.q || 'torvalds').trim();
    const r = await httpGet(`https://api.github.com/users/${encodeURIComponent(user)}`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (r.status !== 200) return { statusCode: r.status === 404 ? 404 : 502, data: { status: false, error: 'User not found' } };
    const u = r.data;
    return { status: true, result: {
      login: u.login, name: u.name, bio: u.bio, followers: u.followers, following: u.following,
      public_repos: u.public_repos, avatar: u.avatar_url, url: u.html_url, source: 'github'
    }};
  }
};
