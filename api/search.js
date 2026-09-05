'use strict';

const core = require('../lib/search-core');
const ARCTIC_HOST = 'arctic-shift.photon-reddit.com';
const originalFetch = global.fetch.bind(globalThis);

function dayAfter(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return value;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function rewriteArcticUrl(input) {
  const raw = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
  if (!raw) return null;
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.hostname !== ARCTIC_HOST || !/^\/api\/(posts|comments)\/search$/.test(url.pathname)) return null;

  const kind = url.pathname.includes('/comments/') ? 'comments' : 'posts';
  const fields = String(url.searchParams.get('fields') || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
    .filter(v => v !== 'permalink');
  if (fields.length) url.searchParams.set('fields', [...new Set(fields)].join(','));

  const before = url.searchParams.get('before');
  if (before) url.searchParams.set('before', dayAfter(before));
  return { url: url.toString(), kind, subreddit: url.searchParams.get('subreddit') || '' };
}

function enrichArcticRows(rows, kind, fallbackSubreddit) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(row => {
    if (!row || typeof row !== 'object' || !row.id) return row;
    const subreddit = String(row.subreddit || fallbackSubreddit || '').replace(/^r\//i, '');
    if (!subreddit) return row;
    if (kind === 'posts') {
      return { ...row, permalink: row.permalink || `/r/${subreddit}/comments/${row.id}/` };
    }
    const postId = String(row.link_id || '').replace(/^t3_/, '');
    return {
      ...row,
      permalink: row.permalink || (postId ? `/r/${subreddit}/comments/${postId}/_/${row.id}/` : '')
    };
  });
}

function enrichArcticPayload(payload, kind, subreddit) {
  if (Array.isArray(payload)) return enrichArcticRows(payload, kind, subreddit);
  if (payload && Array.isArray(payload.data)) return { ...payload, data: enrichArcticRows(payload.data, kind, subreddit) };
  if (payload && Array.isArray(payload.results)) return { ...payload, results: enrichArcticRows(payload.results, kind, subreddit) };
  return payload;
}

async function patchedFetch(input, init) {
  const rewrite = rewriteArcticUrl(input);
  if (!rewrite) return originalFetch(input, init);

  const response = await originalFetch(rewrite.url, init);
  if (!response.ok) return response;
  const payload = await response.json().catch(() => null);
  if (payload === null) return response;
  const enriched = enrichArcticPayload(payload, rewrite.kind, rewrite.subreddit);
  const headers = new Headers(response.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.delete('content-length');
  return new Response(JSON.stringify(enriched), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

if (!globalThis.__distinctAuthorsArcticPatched) {
  globalThis.fetch = patchedFetch;
  globalThis.__distinctAuthorsArcticPatched = true;
}

module.exports = core;
module.exports._test = {
  ...(core._test || {}),
  dayAfter,
  rewriteArcticUrl,
  enrichArcticPayload
};
