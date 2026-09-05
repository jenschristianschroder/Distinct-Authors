'use strict';

const core = require('../lib/search-core');
const ARCTIC_HOST = 'arctic-shift.photon-reddit.com';
const originalFetch = global.fetch.bind(globalThis);
const archiveCache = new Map();

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
  const keywordParam = kind === 'comments' ? 'body' : 'query';
  const term = String(url.searchParams.get(keywordParam) || '').trim();
  url.searchParams.delete(keywordParam);

  const fields = String(url.searchParams.get('fields') || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
    .filter(v => v !== 'permalink');
  if (fields.length) url.searchParams.set('fields', [...new Set(fields)].join(','));

  const before = url.searchParams.get('before');
  if (before) url.searchParams.set('before', dayAfter(before));
  return { url: url.toString(), kind, term, subreddit: url.searchParams.get('subreddit') || '' };
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

function payloadRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function normalized(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function rowMatchesTerm(row, kind, term) {
  const needle = normalized(term);
  if (!needle) return true;
  const haystack = normalized(kind === 'posts' ? `${row?.title || ''} ${row?.selftext || ''}` : row?.body || '');
  return haystack.includes(needle);
}

function makeSlices(after, beforeExclusive, kind) {
  const start = new Date(`${after}T00:00:00Z`);
  const finish = new Date(`${beforeExclusive}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(finish.getTime()) || start >= finish) return [[after, beforeExclusive]];
  const span = Math.max(1, Math.ceil((finish - start) / 86400000));
  const stepDays = kind === 'comments' ? Math.max(2, Math.ceil(span / 24)) : Math.max(7, Math.ceil(span / 12));
  const slices = [];
  for (let cursor = new Date(start); cursor < finish;) {
    const next = new Date(Math.min(cursor.getTime() + stepDays * 86400000, finish.getTime()));
    slices.push([cursor.toISOString().slice(0, 10), next.toISOString().slice(0, 10)]);
    cursor = next;
  }
  return slices;
}

async function fetchBroadArchive(rewrite, init) {
  const base = new URL(rewrite.url);
  const after = base.searchParams.get('after') || '';
  const before = base.searchParams.get('before') || '';
  const fields = base.searchParams.get('fields') || '';
  const cacheKey = [rewrite.kind, rewrite.subreddit.toLowerCase(), after, before, fields].join('|');
  if (archiveCache.has(cacheKey)) return archiveCache.get(cacheKey);

  const promise = (async () => {
    const slices = makeSlices(after, before, rewrite.kind);
    const rows = new Map();
    const errors = [];
    let successes = 0;
    for (const [sliceAfter, sliceBefore] of slices) {
      const url = new URL(base);
      url.searchParams.set('after', sliceAfter);
      url.searchParams.set('before', sliceBefore);
      try {
        const response = await originalFetch(url.toString(), init);
        if (!response.ok) {
          const body = await response.clone().text().catch(() => '');
          errors.push(`HTTP ${response.status}${body ? `: ${body.slice(0, 180)}` : ''}`);
          continue;
        }
        successes++;
        const payload = await response.json().catch(() => null);
        for (const row of payloadRows(payload)) if (row?.id) rows.set(String(row.id), row);
      } catch (error) {
        errors.push(error?.message || String(error));
      }
    }
    const result = { rows: [...rows.values()], successes, failures: slices.length - successes, errors: errors.slice(0, 3), slices: slices.length };
    console.log('Arctic broad backfill diagnostics', JSON.stringify({ kind: rewrite.kind, subreddit: rewrite.subreddit, after, before, rows: result.rows.length, slices: result.slices, failures: result.failures, errors: result.errors }));
    return result;
  })();

  archiveCache.set(cacheKey, promise);
  return promise;
}

async function patchedFetch(input, init) {
  const rewrite = rewriteArcticUrl(input);
  if (!rewrite) return originalFetch(input, init);

  const archive = await fetchBroadArchive(rewrite, init);
  if (!archive.successes && archive.failures) {
    return new Response(JSON.stringify({ error: archive.errors[0] || 'Arctic Shift broad backfill failed.' }), {
      status: 502,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }

  const filtered = archive.rows.filter(row => rowMatchesTerm(row, rewrite.kind, rewrite.term));
  const enriched = enrichArcticRows(filtered, rewrite.kind, rewrite.subreddit);
  return new Response(JSON.stringify({ data: enriched }), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
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
  enrichArcticPayload,
  rowMatchesTerm,
  makeSlices
};
