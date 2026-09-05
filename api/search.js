'use strict';

const arctic = require('../lib/arctic-retrieval');
arctic.installFetchPatch();
const core = require('../lib/search-core');
const post = require('../lib/search-postprocess');

module.exports = async function search(req, res) {
  const originalJson = res.json.bind(res);
  res.json = function interceptedJson(payload) {
    if (Number(res.statusCode || 200) !== 200 || !payload || !Array.isArray(payload.posts) || !Array.isArray(payload.comments)) return originalJson(payload);
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
  mergeArchiveRows: post.mergeArchiveRows
};
