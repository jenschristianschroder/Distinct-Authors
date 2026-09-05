'use strict';

const handler = require('./topics-v2');

module.exports = async function topics(req, res) {
  const originalJson = res.json.bind(res);
  res.json = function topicsJson(payload) {
    if (Number(res.statusCode || 200) === 200 && payload && Array.isArray(payload.topics) && !String(payload.overview || '').trim()) {
      const leaders = payload.topics.slice(0, 5).map(topic => topic?.name).filter(Boolean);
      const total = Number(payload.stats?.total_contributions || 0).toLocaleString();
      payload.overview = `The retrieved r/${payload.subreddit || ''} sample contains ${total} contributions across ${payload.topics.length} detected discussion topics${leaders.length ? `, led by ${leaders.join(', ')}` : ''}. Topic labels come from semantic clustering and AI synthesis; the detailed cards below show the recurring opinions, sentiment, leading voices, and popularity signals for each cluster.`;
    }
    return originalJson(payload);
  };
  try { return await handler(req, res); }
  finally { res.json = originalJson; }
};

module.exports._test = handler._test;
