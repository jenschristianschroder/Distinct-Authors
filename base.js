'use strict';

const API = 'https://arctic-shift.photon-reddit.com/api';
const $ = (id) => document.getElementById(id);

let completed = 0;
let planned = 1;
let lastAuthors = [];
let lastSummary = '';
let lastJson = null;

function localDateInput(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function setDefaults() {
  const end = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - 6);
  $('start').value = localDateInput(start);
  $('end').value = localDateInput(end);
}

function fmt(n, digits = 0) {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function pct(a, b) {
  return b ? `${fmt((a / b) * 100, 1)}%` : '0.0%';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function log(message) {
  $('log').textContent += message + '\n';
  $('log').scrollTop = $('log').scrollHeight;
}

function resetState() {
  $('error').classList.add('hidden');
  $('error').textContent = '';
  $('progressWrap').classList.remove('hidden');
  $('bar').style.width = '1%';
  $('status').textContent = 'Starting…';
  $('log').textContent = '';
  completed = 0;
  planned = 0;
  lastAuthors = [];
  lastSummary = '';
  lastJson = null;
  [
    'results','highlightsCard','activitySection','compositionSection','tableSection','aggregatesSection','logPanel'
  ].forEach(id => $(id).classList.add('hidden'));
}

function updateProgress(message) {
  const pctValue = Math.min(99, Math.max(1, Math.round((completed / Math.max(planned, 1)) * 100)));
  $('bar').style.width = pctValue + '%';
  $('status').textContent = message;
}

function showError(msg) {
  $('error').textContent = msg;
  $('error').classList.remove('hidden');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function countValue(obj) {
  const keys = ['count', 'doc_count', 'value', 'total', 'num'];
  for (const key of keys) {
    if (typeof obj?.[key] === 'number' && Number.isFinite(obj[key])) return obj[key];
  }
  return null;
}

function isLikelyError(payload) {
  if (payload == null) return false;
  const text = JSON.stringify(payload).toLowerCase();
  return text.includes('timed out') || text.includes('timeout') || text.includes('internal server error') || text.includes('too many requests');
}

function normalizeTimeBucket(value, frequency) {
  if (value == null) return null;
  let date;
  if (typeof value === 'number') {
    const ms = value > 1e12 ? value : value > 1e10 ? value : value * 1000;
    date = new Date(ms);
  } else if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) date = new Date(parsed);
    else {
      if (/^\d{4}-\d{2}-\d{2}$/.test(value) || /^\d{4}-\d{2}$/.test(value)) return value;
      return value;
    }
  } else {
    return null;
  }
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  if (frequency === 'month') return `${y}-${m}`;
  return `${y}-${m}-${d}`;
}

function extractAggregateCounts(payload, aggregateType, frequency) {
  const map = new Map();
  const metaKeys = new Set(['error','message','detail','status','_meta','meta','took']);

  const add = (key, value) => {
    if (key == null || key === '') return;
    if (!Number.isFinite(value)) return;
    map.set(key, (map.get(key) || 0) + value);
  };

  const maybePair = (obj) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    const count = countValue(obj);
    if (aggregateType === 'author') {
      for (const k of ['author', 'key', 'name', 'label']) {
        if (typeof obj[k] === 'string' && count != null) {
          add(obj[k], count);
          return true;
        }
      }
    }
    if (aggregateType === 'created_utc') {
      for (const k of ['created_utc', 'key', 'name', 'label', 'date', 'bucket']) {
        if ((typeof obj[k] === 'string' || typeof obj[k] === 'number') && count != null) {
          const normalized = normalizeTimeBucket(obj[k], frequency);
          if (normalized != null) add(normalized, count);
          return true;
        }
      }
    }
    return false;
  };

  const visit = (node) => {
    if (node == null) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== 'object') return;

    if (maybePair(node)) return;

    const entries = Object.entries(node);
    if (entries.length) {
      const allNumericish = entries.every(([k, v]) => !metaKeys.has(k) && (typeof v === 'number' || (v && typeof v === 'object' && countValue(v) != null)));
      if (allNumericish) {
        for (const [k, v] of entries) {
          const rawCount = typeof v === 'number' ? v : countValue(v);
          if (aggregateType === 'author') add(k, rawCount);
          else if (aggregateType === 'created_utc') {
            const normalized = normalizeTimeBucket(k, frequency);
            if (normalized != null) add(normalized, rawCount);
          }
        }
        return;
      }
    }

    for (const value of Object.values(node)) visit(value);
  };

  visit(payload);
  return map;
}

async function fetchJson(url, timeoutMs = 55000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: ctl.signal, headers: { 'Accept': 'application/json' } });
    if (response.status === 429) {
      const reset = Number(response.headers.get('X-RateLimit-Reset')) || 5;
      throw new Error(`Rate limited (retry after ~${reset}s)`);
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function mergeMaps(target, incoming) {
  for (const [k, v] of incoming.entries()) target.set(k, (target.get(k) || 0) + v);
  return target;
}

function midDate(start, end) {
  const a = new Date(start + 'T00:00:00Z');
  const b = new Date(end + 'T00:00:00Z');
  const ms = a.getTime() + Math.floor((b.getTime() - a.getTime()) / 2);
  return new Date(ms).toISOString().slice(0, 10);
}

async function aggregateMap(kind, aggregateType, subreddit, after, before, opts = {}) {
  const { frequency = '', depth = 0, label = aggregateType } = opts;
  const params = new URLSearchParams({ aggregate: aggregateType, subreddit, after, before });
  if (frequency) params.set('frequency', frequency);
  const url = `${API}/${kind}/search/aggregate?${params.toString()}&limit=`;
  let lastErr = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      updateProgress(`${kind}/${label}: ${after} → ${before}`);
      const payload = await fetchJson(url);
      if (isLikelyError(payload)) throw new Error('API timeout');
      const map = extractAggregateCounts(payload, aggregateType, frequency);
      completed += 1;
      log(`${kind.padEnd(8)} ${String(label).padEnd(10)} ${after} → ${before}: ${map.size} buckets`);
      await sleep(220);
      return map;
    } catch (err) {
      lastErr = err;
      log(`${kind.padEnd(8)} ${String(label).padEnd(10)} ${after} → ${before}: attempt ${attempt} failed (${err.message})`);
      if (attempt < 3) await sleep(1100 * attempt);
    }
  }

  const spanDays = Math.ceil((new Date(before + 'T00:00:00Z') - new Date(after + 'T00:00:00Z')) / 86400000);
  if (spanDays > 1) {
    const mid = midDate(after, before);
    planned += 1;
    log(`splitting ${kind}/${label}: ${after} → ${before} at ${mid}`);
    const left = await aggregateMap(kind, aggregateType, subreddit, after, mid, { frequency, depth: depth + 1, label });
    const right = await aggregateMap(kind, aggregateType, subreddit, mid, before, { frequency, depth: depth + 1, label });
    return mergeMaps(left, right);
  }
  throw lastErr || new Error(`Failed to load ${kind}/${label}`);
}

function makeFixedSlices(start, end, stepDays) {
  const out = [];
  let cur = new Date(start + 'T00:00:00Z');
  const finish = new Date(end + 'T00:00:00Z');
  while (cur < finish) {
    const next = new Date(Math.min(cur.getTime() + stepDays * 86400000, finish.getTime()));
    out.push([cur.toISOString().slice(0, 10), next.toISOString().slice(0, 10)]);
    cur = next;
  }
  return out;
}

function makeMonthlySlices(start, end) {
  const out = [];
  let cur = new Date(start + 'T00:00:00Z');
  const finish = new Date(end + 'T00:00:00Z');
  while (cur < finish) {
    const next = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
    const capped = next < finish ? next : finish;
    out.push([cur.toISOString().slice(0, 10), capped.toISOString().slice(0, 10)]);
    cur = capped;
  }
  return out;
}

function determineGranularity(start, end) {
  const choice = $('timeGranularity').value;
  if (choice !== 'auto') return choice;
  const days = Math.ceil((new Date(end + 'T00:00:00Z') - new Date(start + 'T00:00:00Z')) / 86400000);
  if (days <= 62) return 'day';
  if (days <= 420) return 'week';
  return 'month';
}

function sumMap(map) {
  let total = 0;
  for (const value of map.values()) total += value;
  return total;
}

function filterAuthorMap(map) {
  const out = new Map(map);
  if ($('excludeDeleted').checked) out.delete('[deleted]');
  if ($('excludeAutomod').checked) out.delete('AutoModerator');
  return out;
}

function unionAuthorNames(...maps) {
  const set = new Set();
  maps.forEach((map) => { for (const key of map.keys()) set.add(key); });
  return set;
}

function mapToSortedArray(map) {
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function alignSeries(labels, mapA, mapB) {
  return labels.map((label) => ({ label, a: mapA.get(label) || 0, b: mapB.get(label) || 0 }));
}
