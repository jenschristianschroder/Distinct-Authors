'use strict';

const arctic = require('../lib/arctic-retrieval');
arctic.installFetchPatch();
const core = require('../lib/search-core');
const post = require('../lib/search-postprocess');

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_CHEAP_MODEL = 'gpt-5-nano';

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

installModelRouter();

module.exports = async function search(req, res) {
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
  routedOpenAIBody
};
