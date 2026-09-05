'use strict';

const arctic = require('../lib/arctic-retrieval');
arctic.installFetchPatch();
const core = require('../lib/search-core');
const post = require('../lib/search-postprocess');

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_CHEAP_MODEL = 'gpt-5-nano';
const MAX_RANGE_DAYS = 30;

function hasWebSearch(body) {
  return Array.isArray(body?.tools) && body.tools.some(tool => tool?.type === 'web_search');
}

function routedOpenAIBody(body) {
  if (!body || typeof body !== 'object' || hasWebSearch(body)) return body;
  return { ...body, model: String(process.env.OPENAI_CHEAP_MODEL || process.env.OPENAI_SUMMARY_MODEL || DEFAULT_CHEAP_MODEL).trim() };
}

function installModelRouter() {
  if (globalThis.__distinctAuthorsModelRouterInstalled) return;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async function modelRoutedFetch(input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url;
    if (url === OPENAI_RESPONSES_URL && init?.body) {
      try {
        const body = JSON.parse(String(init.body));
        const routed = routedOpenAIBody(body);
        if (routed !== body) init = { ...init, body: JSON.stringify(routed) };
      } catch {}
    }
    return previousFetch(input, init);
  };
  globalThis.__distinctAuthorsModelRouterInstalled = true;
}

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

installModelRouter();

module.exports = async function search(req, res) {
  if (req?.method === 'POST') {
    const body = parsedBody(req);
    const days = inclusiveDays(body.start, body.end);
    if (Number.isFinite(days) && days > MAX_RANGE_DAYS) {
      setRangeErrorCors(req, res);
      return res.status(400).json({ error: `Choose a date range of ${MAX_RANGE_DAYS} days or less (one month maximum).` });
    }
  }

  const originalJson = res.json.bind(res);
  res.json = function interceptedJson(payload) {
    if (Number(res.statusCode || 200) !== 200 || !payload || !Array.isArray(payload.posts) || !Array.isArray(payload.comments)) return originalJson(payload);
    payload.models = {
      search: payload.model || process.env.OPENAI_SEARCH_MODEL || 'gpt-5.6-luna',
      expansion_and_summary: String(process.env.OPENAI_CHEAP_MODEL || process.env.OPENAI_SUMMARY_MODEL || DEFAULT_CHEAP_MODEL).trim()
    };
    return post.postProcess(payload, req).then(originalJson);
  };
  try { return await core(req, res); }
  finally { res.json = originalJson; }
};

module.exports._test = {
  ...(core._test || {}),
  dayAfter: arctic.dayAfter,
  rewriteArcticUrl: arctic.rewriteArcticUrl,
  enrichArcticPayload: arctic.enrichArcticPayload,
  rowMatchesTerm: arctic.rowMatchesTerm,
  variantMatchScore: arctic.variantMatchScore,
  topicMatchScore: arctic.topicMatchScore,
  makeSlices: arctic.makeSlices,
  strictTopicVariants: post.strictTopicVariants,
  isUnknownAuthor: post.isUnknownAuthor,
  selectContextComments: post.selectContextComments,
  mergeArchiveRows: post.mergeArchiveRows,
  hasWebSearch,
  routedOpenAIBody,
  inclusiveDays,
  MAX_RANGE_DAYS
};
