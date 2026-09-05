'use strict';

const arctic = require('./arctic-retrieval');

const POSITIVE = new Map(Object.entries({good:1,great:2,excellent:3,amazing:3,awesome:3,love:3,like:1,liked:1,fun:2,enjoy:2,enjoyed:2,better:1,best:3,improve:1,improved:2,improvement:2,helpful:2,useful:2,strong:1,balanced:1,fair:1,happy:2,worth:1,win:1,wins:1,winning:2,success:2,successful:2,excited:2,exciting:2,perfect:3,nice:1,solid:1,recommend:2,recommended:2,favorite:2,favourite:2,reasonable:1,glad:2,positive:2,benefit:1,beneficial:2,works:1,working:1,fix:1,fixed:2}));
const NEGATIVE = new Map(Object.entries({bad:1,worse:2,worst:3,hate:3,hated:3,awful:3,terrible:3,boring:2,annoying:2,annoyed:2,broken:3,bug:1,bugs:1,buggy:2,unfair:2,expensive:2,greedy:2,frustrating:2,frustrated:2,disappointing:2,disappointed:2,problem:1,problems:1,issue:1,issues:1,nerf:1,nerfed:2,weak:1,useless:2,waste:2,scam:3,trash:3,garbage:3,ridiculous:2,impossible:2,slow:1,grind:1,grindy:2,paywall:3,p2w:3,negative:2,fail:2,fails:2,failure:2,remove:1,removed:1,quit:2,quitting:2}));
const NEGATORS = new Set(['not','no','never','isnt','isn\'t','wasnt','wasn\'t','dont','don\'t','doesnt','doesn\'t','didnt','didn\'t','cant','can\'t','cannot','hardly','barely']);
const INTENSIFIERS = new Set(['very','really','extremely','super','so','too','incredibly','absolutely']);
const STOP = new Set(`the a an and or but if then than to of for from in on at by with about as is are was were be been being it its this that these those i me my we our you your he she they them their reddit subreddit post posts comment comments game just really very can could would should do does did have has had get got getting make makes made much many more most less least also only even still already now then when where why how what which who not no yes yeah yep one two three thing things something anything everything people person player players time times way ways use used using like think know want need seems seem feel feels felt because anyone everyone someone today yesterday tomorrow week month year update question help discussion new`.split(/\s+/));
const UNKNOWN = new Set(['','[unknown]','unknown','[unavailable]','unavailable','[deleted]','deleted']);

function clean(value, max = 1000) {
  return String(value || '').replace(/\u0000/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/https?:\/\/\S+/g, ' ').replace(/[^a-z0-9'\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokens(value) {
  return normalize(value).split(' ').filter(Boolean);
}

function unavailableAuthor(value) {
  return UNKNOWN.has(String(value || '').trim().toLowerCase());
}

function rowText(row, kind) {
  return kind === 'post' ? `${row?.title || ''}. ${row?.selftext || ''}` : String(row?.body || '');
}

function sentiment(value) {
  const words = tokens(value);
  let score = 0;
  let hits = 0;
  for (let i = 0; i < words.length; i++) {
    const base = (POSITIVE.get(words[i]) || 0) - (NEGATIVE.get(words[i]) || 0);
    if (!base) continue;
    let multiplier = 1;
    if (INTENSIFIERS.has(words[i - 1])) multiplier = 1.5;
    if (NEGATORS.has(words[i - 1]) || NEGATORS.has(words[i - 2])) multiplier *= -1;
    score += base * multiplier;
    hits++;
  }
  const normalized = hits ? score / Math.sqrt(hits) : 0;
  return { score: normalized, label: normalized > 0.55 ? 'positive' : normalized < -0.55 ? 'negative' : 'neutral' };
}

function candidatePhrases(posts, comments, limit = 60) {
  const counts = new Map();
  function addRow(row, kind, weight) {
    const seen = new Set();
    const words = tokens(rowText(row, kind)).filter(word => word.length >= 4 && !STOP.has(word) && !/^\d+$/.test(word));
    for (const word of words) seen.add(word);
    for (let i = 0; i < words.length - 1; i++) {
      const a = words[i], b = words[i + 1];
      if (a === b || STOP.has(a) || STOP.has(b)) continue;
      seen.add(`${a} ${b}`);
    }
    for (const phrase of seen) counts.set(phrase, (counts.get(phrase) || 0) + weight);
  }
  for (const post of posts || []) addRow(post, 'post', 2.2);
  for (const comment of comments || []) addRow(comment, 'comment', 1);
  return [...counts.entries()]
    .filter(([phrase, count]) => count >= 3 && (phrase.includes(' ') || count >= 6))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([phrase, count]) => ({ phrase, count: Math.round(count * 10) / 10 }));
}

function dateLabel(timestamp) {
  const n = Number(timestamp || 0);
  if (!n) return '';
  const d = new Date(n > 1e12 ? n : n * 1000);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function rowQuality(row, kind) {
  const score = Number(row?.score || 0);
  const comments = kind === 'post' ? Number(row?.num_comments || 0) : 0;
  const textLength = rowText(row, kind).length;
  return Math.log2(Math.max(0, score) + 2) * 6 + Math.log2(comments + 2) * 3 + Math.min(textLength, 700) / 100;
}

function diverseSample(posts, comments, maxChars = 65000) {
  const candidates = [];
  for (const row of posts || []) candidates.push({ row, kind: 'post', quality: rowQuality(row, 'post') + 4 });
  for (const row of comments || []) candidates.push({ row, kind: 'comment', quality: rowQuality(row, 'comment') });
  candidates.sort((a, b) => b.quality - a.quality);

  const picked = [];
  const seenDays = new Map();
  let chars = 0;
  function lineFor(item) {
    const r = item.row;
    const author = unavailableAuthor(r.author) ? '' : clean(r.author, 80);
    if (item.kind === 'post') {
      return `POST | ${dateLabel(r.created_utc)} | score ${Number(r.score || 0)} | comments ${Number(r.num_comments || 0)} | ${author} | ${clean(r.title, 220)} | ${clean(r.selftext, 360)}`;
    }
    return `COMMENT | ${dateLabel(r.created_utc)} | score ${Number(r.score || 0)} | ${author} | ${clean(r.body, 420)}`;
  }

  for (const item of candidates) {
    const day = dateLabel(item.row.created_utc) || 'unknown';
    const dayCount = seenDays.get(`${item.kind}:${day}`) || 0;
    const maxPerDay = item.kind === 'post' ? 9 : 12;
    if (dayCount >= maxPerDay) continue;
    const line = lineFor(item);
    if (!line || chars + line.length + 1 > maxChars) continue;
    picked.push(line);
    chars += line.length + 1;
    seenDays.set(`${item.kind}:${day}`, dayCount + 1);
    if (chars >= maxChars * 0.97) break;
  }
  return picked.join('\n');
}

function parseJsonText(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(raw); } catch {}
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)); } catch {}
  }
  return {};
}

function variantScore(text, variant) {
  const phrase = arctic.normalized(variant);
  if (!phrase) return 0;
  const haystack = arctic.normalized(text);
  if (haystack.includes(phrase)) return 100;
  return arctic.variantMatchScore(text, variant);
}

function topicScore(row, kind, topic) {
  const text = rowText(row, kind === 'post' ? 'posts' : 'comments');
  const variants = [topic?.name, ...(Array.isArray(topic?.keywords) ? topic.keywords : [])]
    .map(value => clean(value, 100)).filter(Boolean);
  let best = 0;
  for (const variant of variants) {
    const wordCount = tokens(variant).filter(word => !STOP.has(word)).length;
    const score = variantScore(text, variant);
    if (wordCount <= 1 && tokens(variant)[0]?.length < 5) continue;
    best = Math.max(best, score);
  }
  return best;
}

function primaryAssignments(posts, comments, topics) {
  const buckets = (topics || []).map(() => ({ posts: [], comments: [] }));
  function assign(row, kind) {
    let bestIndex = -1;
    let bestScore = 0;
    topics.forEach((topic, index) => {
      const score = topicScore(row, kind, topic);
      if (score > bestScore) { bestScore = score; bestIndex = index; }
    });
    if (bestIndex < 0 || bestScore < 55) return;
    buckets[bestIndex][kind === 'post' ? 'posts' : 'comments'].push(row);
  }
  for (const post of posts || []) assign(post, 'post');
  for (const comment of comments || []) assign(comment, 'comment');
  return buckets;
}

function rankVoices(rows, limit = 5) {
  const counts = new Map();
  for (const row of rows || []) {
    if (unavailableAuthor(row?.author)) continue;
    const author = String(row.author);
    counts.set(author, (counts.get(author) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([author, count]) => ({ author, count }));
}

function redditUrl(post, subreddit) {
  if (post?.permalink) return `https://www.reddit.com${String(post.permalink).startsWith('/') ? '' : '/'}${post.permalink}`;
  if (post?.id) return `https://www.reddit.com/r/${subreddit}/comments/${post.id}/`;
  return '';
}

function topicMetrics(posts, comments, topics, subreddit) {
  const buckets = primaryAssignments(posts, comments, topics);
  const totalsAssigned = Math.max(1, buckets.reduce((sum, bucket) => sum + bucket.posts.length + bucket.comments.length, 0));
  return topics.map((topic, index) => {
    const bucket = buckets[index];
    const items = [
      ...bucket.posts.map(row => ({ row, kind: 'post', ...sentiment(rowText(row, 'post')) })),
      ...bucket.comments.map(row => ({ row, kind: 'comment', ...sentiment(rowText(row, 'comment')) }))
    ];
    const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
    items.forEach(item => sentimentCounts[item.label]++);
    const total = items.length;
    const popularPosts = [...bucket.posts].sort((a, b) => Number(b.score || 0) - Number(a.score || 0)).slice(0, 5).map(post => ({
      id: post.id,
      title: clean(post.title || '(untitled)', 220),
      author: unavailableAuthor(post.author) ? '' : clean(post.author, 80),
      score: Number(post.score || 0),
      num_comments: Number(post.num_comments || 0),
      url: redditUrl(post, subreddit)
    }));
    const representative = items.sort((a, b) => (Math.abs(b.score) * 4 + rowQuality(b.row, b.kind)) - (Math.abs(a.score) * 4 + rowQuality(a.row, a.kind))).slice(0, 5).map(item => ({
      kind: item.kind,
      author: unavailableAuthor(item.row.author) ? '' : clean(item.row.author, 80),
      sentiment: item.label,
      text: clean(rowText(item.row, item.kind), 300),
      score: Number(item.row.score || 0)
    }));
    const postScore = bucket.posts.length ? bucket.posts.reduce((sum, row) => sum + Number(row.score || 0), 0) / bucket.posts.length : 0;
    return {
      ...topic,
      posts: bucket.posts.length,
      comments: bucket.comments.length,
      contributions: total,
      share: total / totalsAssigned,
      sentiment: sentimentCounts,
      average_post_score: Math.round(postScore * 10) / 10,
      top_authors: rankVoices(bucket.posts),
      top_commenters: rankVoices(bucket.comments),
      popular_posts: popularPosts,
      representative
    };
  }).sort((a, b) => b.contributions - a.contributions);
}

function overallSentiment(posts, comments) {
  const counts = { positive: 0, neutral: 0, negative: 0 };
  for (const post of posts || []) counts[sentiment(rowText(post, 'post')).label]++;
  for (const comment of comments || []) counts[sentiment(rowText(comment, 'comment')).label]++;
  return counts;
}

module.exports = {
  clean, normalize, tokens, unavailableAuthor, rowText, sentiment, candidatePhrases, diverseSample,
  parseJsonText, topicScore, primaryAssignments, rankVoices, topicMetrics, overallSentiment
};
