'use strict';

const PLACEHOLDER_TEXT = new Set([
  '', '[removed]', '[deleted]', 'removed', 'deleted', '[unavailable]', 'unavailable'
]);

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .toLocaleLowerCase('en-US')
    .replace(/\p{M}+/gu, '')
    .replace(/https?:\/\/\S+/giu, ' ')
    .replace(/[^\p{L}\p{N}'’\-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function rowText(row, kind) {
  return kind === 'post' ? `${row?.title || ''}. ${row?.selftext || ''}` : String(row?.body || '');
}

function isPlaceholderText(value) {
  const normalized = normalizeText(value);
  return PLACEHOLDER_TEXT.has(normalized) || /^\[?(?:removed|deleted|unavailable)\]?$/iu.test(normalized);
}

function isAutomationAuthor(author, subreddit = '') {
  const value = String(author || '').trim().toLocaleLowerCase('en-US');
  if (!value) return false;
  if (value === 'automoderator') return true;
  const community = String(subreddit || '').trim().replace(/^r\//iu, '').toLocaleLowerCase('en-US');
  if (community && value === `${community}-modteam`) return true;
  return /(?:^|[-_])modteam$/iu.test(value);
}

function fingerprint(value) {
  return normalizeText(value)
    .replace(/\b\d{2,}\b/gu, '#')
    .slice(0, 1200);
}

function usableRow(row, kind) {
  const text = rowText(row, kind);
  if (!text || isPlaceholderText(text)) return false;
  const normalized = normalizeText(text);
  if (kind === 'comment') return normalized.length >= 3;
  return normalized.length >= 3 && !isPlaceholderText(row?.title || '');
}

function repeatedFingerprints(posts, comments, minRepeats = 6) {
  const counts = new Map();
  for (const [rows, kind] of [[posts || [], 'post'], [comments || [], 'comment']]) {
    for (const row of rows) {
      const text = rowText(row, kind);
      const key = fingerprint(text);
      if (key.length < 80) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return new Set([...counts.entries()].filter(([, count]) => count >= minRepeats).map(([key]) => key));
}

function filterCorpus(posts, comments, subreddit = '') {
  const repeated = repeatedFingerprints(posts, comments);
  const stats = {
    automation_removed: 0,
    repeated_boilerplate_removed: 0,
    placeholder_removed: 0,
    original_posts: (posts || []).length,
    original_comments: (comments || []).length
  };

  function filter(rows, kind) {
    const kept = [];
    for (const row of rows || []) {
      if (!usableRow(row, kind)) {
        stats.placeholder_removed++;
        continue;
      }
      if (isAutomationAuthor(row?.author, subreddit)) {
        stats.automation_removed++;
        continue;
      }
      const key = fingerprint(rowText(row, kind));
      if (key.length >= 80 && repeated.has(key)) {
        stats.repeated_boilerplate_removed++;
        continue;
      }
      kept.push(row);
    }
    return kept;
  }

  const cleanPosts = filter(posts, 'post');
  const cleanComments = filter(comments, 'comment');
  return {
    posts: cleanPosts,
    comments: cleanComments,
    stats: {
      ...stats,
      analyzed_posts: cleanPosts.length,
      analyzed_comments: cleanComments.length,
      analyzed_contributions: cleanPosts.length + cleanComments.length,
      noise_removed: stats.automation_removed + stats.repeated_boilerplate_removed + stats.placeholder_removed
    }
  };
}

function corpusStopTerms(posts, comments, seedTerms = [], threshold = 0.45) {
  const rows = [
    ...(posts || []).map(row => rowText(row, 'post')),
    ...(comments || []).map(row => rowText(row, 'comment'))
  ];
  const stop = new Set();
  for (const seed of seedTerms || []) {
    for (const token of normalizeText(seed).split(' ').filter(Boolean)) stop.add(token);
  }
  if (rows.length < 20) return stop;

  const docCounts = new Map();
  for (const text of rows) {
    const unique = new Set(normalizeText(text).split(' ').filter(token => token.length >= 3));
    for (const token of unique) docCounts.set(token, (docCounts.get(token) || 0) + 1);
  }
  const minimum = Math.ceil(rows.length * Math.max(0.2, Math.min(0.9, threshold)));
  for (const [token, count] of docCounts) if (count >= minimum) stop.add(token);
  return stop;
}

module.exports = {
  normalizeText,
  rowText,
  isPlaceholderText,
  isAutomationAuthor,
  fingerprint,
  filterCorpus,
  corpusStopTerms
};
