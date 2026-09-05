'use strict';

const ARCTIC_HOST = 'arctic-shift.photon-reddit.com';
const OPENAI_URL = 'https://api.openai.com/v1/responses';
const originalFetch = global.fetch.bind(globalThis);
const archiveCache = new Map();
const TOPIC_STOP = new Set('the a an and or but if then than to of for from in on at by with about as is are was were be been being it its this that these those reddit post comment game'.split(/\s+/));

function dayAfter(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return value;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function payloadRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function enrichArcticRows(rows, kind, fallbackSubreddit) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(row => {
    if (!row || typeof row !== 'object' || !row.id) return row;
    const subreddit = String(row.subreddit || fallbackSubreddit || '').replace(/^r\//i, '');
    if (!subreddit) return row;
    if (kind === 'posts') return { ...row, permalink: row.permalink || `/r/${subreddit}/comments/${row.id}/` };
    const postId = String(row.link_id || '').replace(/^t3_/, '');
    return { ...row, permalink: row.permalink || (postId ? `/r/${subreddit}/comments/${postId}/_/${row.id}/` : '') };
  });
}

function enrichArcticPayload(payload, kind, subreddit) {
  if (Array.isArray(payload)) return enrichArcticRows(payload, kind, subreddit);
  if (payload && Array.isArray(payload.data)) return { ...payload, data: enrichArcticRows(payload.data, kind, subreddit) };
  if (payload && Array.isArray(payload.results)) return { ...payload, results: enrichArcticRows(payload.results, kind, subreddit) };
  return payload;
}

function normalized(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function canonicalToken(value) {
  let token = String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) token = token.slice(0, -1);
  return token;
}

function tokenSet(value) {
  return new Set(normalized(value).split(' ').map(canonicalToken).filter(token => token.length > 2 && !TOPIC_STOP.has(token)));
}

function rowText(row, kind) {
  return kind === 'posts' ? `${row?.title || ''} ${row?.selftext || ''}` : String(row?.body || '');
}

function rowMatchesTerm(row, kind, term) {
  const needle = normalized(term);
  if (!needle) return true;
  return normalized(rowText(row, kind)).includes(needle);
}

function variantMatchScore(text, variant) {
  const phrase = normalized(variant);
  if (!phrase) return 0;
  const haystack = normalized(text);
  if (haystack.includes(phrase)) return 100;
  const wanted = tokenSet(variant);
  if (!wanted.size) return 0;
  const present = tokenSet(text);
  let matched = 0;
  for (const token of wanted) if (present.has(token)) matched++;
  if (wanted.size === 1) return matched ? 55 : 0;
  const ratio = matched / wanted.size;
  return matched >= 2 && ratio >= 0.6 ? 60 + Math.round(ratio * 20) : 0;
}

function topicMatchScore(row, kind, variants) {
  const text = rowText(row, kind);
  let best = 0;
  for (const variant of variants || []) best = Math.max(best, variantMatchScore(text, variant));
  return best;
}

function makeSlices(after, beforeExclusive, kind) {
  const start = new Date(`${after}T00:00:00Z`);
  const finish = new Date(`${beforeExclusive}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(finish.getTime()) || start >= finish) return [[after, beforeExclusive]];
  const span = Math.max(1, Math.ceil((finish - start) / 86400000));
  const stepDays = kind === 'comments' ? 1 : Math.max(5, Math.ceil(span / 14));
  const slices = [];
  for (let cursor = new Date(start); cursor < finish;) {
    const next = new Date(Math.min(cursor.getTime() + stepDays * 86400000, finish.getTime()));
    slices.push([cursor.toISOString().slice(0, 10), next.toISOString().slice(0, 10)]);
    cursor = next;
  }
  return slices;
}

async function fetchOriginalWithTimeout(url, init = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await originalFetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
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
  const linkId = String(url.searchParams.get('link_id') || '').replace(/^t3_/, '').trim();
  url.searchParams.delete(keywordParam);
  url.searchParams.delete('link_id');
  const fields = String(url.searchParams.get('fields') || '').split(',').map(v => v.trim()).filter(Boolean).filter(v => v !== 'permalink');
  if (fields.length) url.searchParams.set('fields', [...new Set(fields)].join(','));
  const before = url.searchParams.get('before');
  if (before) url.searchParams.set('before', dayAfter(before));
  return { url: url.toString(), kind, term, linkId, subreddit: url.searchParams.get('subreddit') || '' };
}

async function fetchBroadArchive(rewrite, init = {}) {
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
    for (let index = 0; index < slices.length; index += 4) {
      const batch = slices.slice(index, index + 4);
      const results = await Promise.all(batch.map(async ([sliceAfter, sliceBefore]) => {
        const url = new URL(base);
        url.searchParams.set('after', sliceAfter);
        url.searchParams.set('before', sliceBefore);
        try {
          const response = await fetchOriginalWithTimeout(url.toString(), init, 11000);
          if (!response.ok) {
            const body = await response.clone().text().catch(() => '');
            return { ok: false, error: `HTTP ${response.status}${body ? `: ${body.slice(0, 180)}` : ''}` };
          }
          return { ok: true, rows: payloadRows(await response.json().catch(() => null)) };
        } catch (error) { return { ok: false, error: error?.message || String(error) }; }
      }));
      for (const result of results) {
        if (!result.ok) { errors.push(result.error); continue; }
        successes++;
        for (const row of result.rows || []) if (row?.id) rows.set(String(row.id), row);
      }
    }
    const result = { rows: [...rows.values()], successes, failures: slices.length - successes, errors: errors.slice(0, 3), slices: slices.length };
    console.log('Arctic broad backfill diagnostics', JSON.stringify({ kind: rewrite.kind, subreddit: rewrite.subreddit, after, before, rows: result.rows.length, slices: result.slices, failures: result.failures, errors: result.errors }));
    return result;
  })();
  archiveCache.set(cacheKey, promise);
  return promise;
}

function shouldDeferCoreSummary(input, init) {
  const raw = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
  if (raw !== OPENAI_URL || String(init?.method || 'GET').toUpperCase() !== 'POST') return false;
  try {
    const body = JSON.parse(String(init?.body || '{}'));
    return String(body?.instructions || '').startsWith('Summarize this retrieved Reddit sample conservatively.');
  } catch { return false; }
}

function deferredSummaryResponse() {
  return new Response(JSON.stringify({ id: 'resp_deferred_summary', object: 'response', output: [{ type: 'message', content: [{ type: 'output_text', text: '' }] }] }), { status: 200, headers: { 'content-type': 'application/json' } });
}

async function patchedFetch(input, init) {
  if (shouldDeferCoreSummary(input, init)) return deferredSummaryResponse();
  const rewrite = rewriteArcticUrl(input);
  if (!rewrite) return originalFetch(input, init);
  const archive = await fetchBroadArchive(rewrite, init);
  if (!archive.successes && archive.failures) return new Response(JSON.stringify({ error: archive.errors[0] || 'Arctic Shift broad backfill failed.' }), { status: 502, headers: { 'content-type': 'application/json; charset=utf-8' } });
  const filtered = archive.rows.filter(row => (!rewrite.linkId || String(row?.link_id || '').replace(/^t3_/, '') === rewrite.linkId) && rowMatchesTerm(row, rewrite.kind, rewrite.term));
  return new Response(JSON.stringify({ data: enrichArcticRows(filtered, rewrite.kind, rewrite.subreddit) }), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

function installFetchPatch() {
  if (!globalThis.__distinctAuthorsArcticPatchedV2) {
    globalThis.fetch = patchedFetch;
    globalThis.__distinctAuthorsArcticPatchedV2 = true;
  }
}

function broadRewrite(kind, subreddit, start, end) {
  const fields = kind === 'posts' ? 'id,author,created_utc,title,selftext,score,num_comments,url,subreddit' : 'id,author,created_utc,body,score,link_id,parent_id,subreddit';
  const query = new URLSearchParams({ subreddit, after: start, before: dayAfter(end), sort: 'desc', limit: 'auto', fields });
  return { url: `https://${ARCTIC_HOST}/api/${kind}/search?${query}`, kind, term: '', linkId: '', subreddit };
}

async function fetchIdRows(kind, ids, subreddit) {
  const unique = [...new Set((ids || []).map(value => String(value || '').replace(/^t[13]_/, '')).filter(Boolean))];
  if (!unique.length) return [];
  const rows = [];
  for (let index = 0; index < unique.length; index += 250) {
    try {
      const batch = unique.slice(index, index + 250);
      const url = `https://${ARCTIC_HOST}/api/${kind}/ids?${new URLSearchParams({ ids: batch.join(',') })}`;
      const response = await fetchOriginalWithTimeout(url, { headers: { Accept: 'application/json' } }, 10000);
      if (response.ok) rows.push(...payloadRows(await response.json().catch(() => null)));
    } catch {}
  }
  return enrichArcticRows(rows.filter(row => !row?.subreddit || String(row.subreddit).toLowerCase() === String(subreddit).toLowerCase()), kind, subreddit);
}

module.exports = {
  ARCTIC_HOST, OPENAI_URL, originalFetch, dayAfter, payloadRows, enrichArcticRows, enrichArcticPayload,
  normalized, tokenSet, rowMatchesTerm, variantMatchScore, topicMatchScore, makeSlices,
  fetchOriginalWithTimeout, rewriteArcticUrl, fetchBroadArchive, installFetchPatch, broadRewrite, fetchIdRows
};