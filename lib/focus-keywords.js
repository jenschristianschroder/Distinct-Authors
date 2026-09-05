'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');

const EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
const keywordContext = new AsyncLocalStorage();

function normalizePhrase(value) {
  let text = String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!text || text.length > 48) return '';
  if (/(?:https?:\/\/|www\.|[@<>\[\]{}\\\/:`])/iu.test(text)) return '';
  const words = text.split(' ');
  if (words.length > 5) return '';
  if (!words.every(word => /^[\p{L}\p{N}][\p{L}\p{N}'’\-]*$/u.test(word))) return '';
  return text;
}

function sanitizeKeywords(raw) {
  const values = Array.isArray(raw) ? raw : String(raw ?? '').split(/[,;\n]+/);
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const phrase = normalizePhrase(value);
    const key = phrase.toLocaleLowerCase('en-US');
    if (!phrase || seen.has(key)) continue;
    seen.add(key);
    result.push(phrase);
    if (result.length >= 8) break;
  }
  return result;
}

function normalized(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[’']/g, "'")
    .replace(/[^\p{L}\p{N}'\-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesPhrase(text, phrase) {
  const haystack = ` ${normalized(text)} `;
  const needle = normalized(phrase);
  return Boolean(needle && haystack.includes(` ${needle} `));
}

function augmentEmbeddingInputs(inputs, keywords) {
  const safe = sanitizeKeywords(keywords);
  if (!safe.length || !Array.isArray(inputs)) return inputs;
  return inputs.map(value => {
    const text = String(value ?? '');
    const matched = safe.filter(keyword => matchesPhrase(text, keyword));
    if (!matched.length) return value;
    // This marker goes only to the embeddings endpoint. It is semantic data,
    // never an instruction to a generative model.
    return `${text}\n\nsemantic_anchor_terms: ${matched.join(' | ')}`;
  });
}

function rewriteOpenAIBody(url, body, keywords) {
  if (url !== EMBEDDINGS_URL || !body || typeof body !== 'object') return body;
  if (!Array.isArray(body.input)) return body;
  return { ...body, input: augmentEmbeddingInputs(body.input, keywords) };
}

function installFetchPatch() {
  if (globalThis.__distinctAuthorsFocusKeywordPatchInstalled) return;
  const previousFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async function focusKeywordFetch(input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url;
    const context = keywordContext.getStore();
    if (context?.keywords?.length && init?.body) {
      try {
        const parsed = JSON.parse(String(init.body));
        const rewritten = rewriteOpenAIBody(url, parsed, context.keywords);
        if (rewritten !== parsed) init = { ...init, body: JSON.stringify(rewritten) };
      } catch {}
    }
    return previousFetch(input, init);
  };
  globalThis.__distinctAuthorsFocusKeywordPatchInstalled = true;
}

function runWithKeywords(keywords, fn) {
  return keywordContext.run({ keywords: sanitizeKeywords(keywords) }, fn);
}

function topicFocusScore(topic, keywords) {
  const safe = sanitizeKeywords(keywords);
  if (!safe.length) return 0;
  const name = normalized(topic?.name);
  const description = normalized(topic?.description);
  const topicKeywords = (Array.isArray(topic?.keywords) ? topic.keywords : []).map(normalized);
  let score = 0;
  for (const keyword of safe) {
    const key = normalized(keyword);
    if (!key) continue;
    if (name.includes(key)) score += 6;
    if (topicKeywords.some(value => value.includes(key) || key.includes(value))) score += 4;
    if (description.includes(key)) score += 2;
  }
  return score;
}

function prioritizeTopics(topics, keywords) {
  const safe = sanitizeKeywords(keywords);
  if (!safe.length || !Array.isArray(topics)) return topics;
  return topics.map((topic, index) => {
    const score = topicFocusScore(topic, safe);
    return { ...topic, focus_score: score, focus_match: score > 0, __focusIndex: index };
  }).sort((a, b) => (b.focus_score - a.focus_score) || (a.__focusIndex - b.__focusIndex)).map(topic => {
    const { __focusIndex, ...cleanTopic } = topic;
    return cleanTopic;
  });
}

module.exports = {
  EMBEDDINGS_URL,
  sanitizeKeywords,
  augmentEmbeddingInputs,
  rewriteOpenAIBody,
  installFetchPatch,
  runWithKeywords,
  topicFocusScore,
  prioritizeTopics
};
