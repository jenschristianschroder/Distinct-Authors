'use strict';

const handler = require('./topics-v2');
const MAX_RANGE_DAYS = 30;

function parsedBody(req) {
  if (!req) return {};
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

function inclusiveDays(start, end) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(start || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(end || ''))) return NaN;
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
  return Math.floor((b - a) / 86400000) + 1;
}

function setRangeErrorCors(req, res) {
  const origin = req?.headers?.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Cache-Control', 'no-store');
}

module.exports = async function topics(req, res) {
  if (req?.method === 'POST') {
    const body = parsedBody(req);
    const days = inclusiveDays(body.start, body.end);
    if (Number.isFinite(days) && days > MAX_RANGE_DAYS) {
      setRangeErrorCors(req, res);
      return res.status(400).json({ error: `Choose a date range of ${MAX_RANGE_DAYS} days or less (one month maximum).` });
    }
  }

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

module.exports._test = { ...(handler._test || {}), inclusiveDays, MAX_RANGE_DAYS };
