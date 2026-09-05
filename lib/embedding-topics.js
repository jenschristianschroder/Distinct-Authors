'use strict';

const landscape = require('./topic-landscape');

function quality(row, kind) {
  const score = Math.max(0, Number(row?.score || 0));
  const replies = kind === 'post' ? Math.max(0, Number(row?.num_comments || 0)) : 0;
  const length = landscape.rowText(row, kind).length;
  return Math.log2(score + 2) * 4 + Math.log2(replies + 2) * 2 + Math.min(length, 700) / 120 + (kind === 'post' ? 2 : 0);
}

function itemFromRow(row, kind) {
  const raw = landscape.clean(landscape.rowText(row, kind), kind === 'post' ? 700 : 560);
  if (!raw) return null;
  return {
    id: String(row?.id || `${kind}-${Number(row?.created_utc || 0)}-${raw.slice(0, 32)}`),
    kind,
    row,
    text: `${kind.toUpperCase()} | ${raw}`,
    created_utc: Number(row?.created_utc || 0),
    quality: quality(row, kind)
  };
}

function mixedSample(rows, kind, target) {
  const items = (rows || []).map(row => itemFromRow(row, kind)).filter(Boolean);
  if (items.length <= target) return items;
  const byQuality = [...items].sort((a, b) => b.quality - a.quality || b.created_utc - a.created_utc);
  const byTime = [...items].sort((a, b) => a.created_utc - b.created_utc);
  const selected = new Map();
  const qualityTarget = Math.ceil(target * 0.55);
  for (const item of byQuality.slice(0, qualityTarget)) selected.set(item.id, item);
  const remaining = target - selected.size;
  for (let i = 0; i < remaining * 2 && selected.size < target; i++) {
    const fraction = remaining <= 1 ? 0.5 : i / Math.max(1, remaining * 2 - 1);
    const index = Math.min(byTime.length - 1, Math.round(fraction * (byTime.length - 1)));
    const item = byTime[index];
    if (item) selected.set(item.id, item);
  }
  for (const item of byTime) {
    if (selected.size >= target) break;
    selected.set(item.id, item);
  }
  return [...selected.values()].slice(0, target);
}

function sampleCorpus(posts, comments, limit = 240) {
  const total = Math.max(40, Math.min(400, Number(limit || 240)));
  const postTarget = Math.min((posts || []).length, Math.max(20, Math.round(total * 0.45)));
  const commentTarget = Math.min((comments || []).length, total - postTarget);
  let result = [...mixedSample(posts, 'post', postTarget), ...mixedSample(comments, 'comment', commentTarget)];
  if (result.length < total) {
    const ids = new Set(result.map(item => `${item.kind}:${item.id}`));
    for (const item of [...mixedSample(posts, 'post', total), ...mixedSample(comments, 'comment', total)]) {
      const key = `${item.kind}:${item.id}`;
      if (ids.has(key)) continue;
      ids.add(key);
      result.push(item);
      if (result.length >= total) break;
    }
  }
  return result.sort((a, b) => a.created_utc - b.created_utc || b.quality - a.quality).slice(0, total);
}

function normalizeVector(vector) {
  const values = Array.isArray(vector) ? vector.map(Number) : [];
  let sum = 0;
  for (const value of values) sum += value * value;
  const norm = Math.sqrt(sum) || 1;
  return values.map(value => value / norm);
}

function similarity(a, b) {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < length; i++) dot += a[i] * b[i];
  return dot;
}

function meanVector(vectors, dimensions) {
  const mean = new Array(dimensions).fill(0);
  if (!vectors.length) return mean;
  for (const vector of vectors) for (let i = 0; i < dimensions; i++) mean[i] += vector[i] || 0;
  for (let i = 0; i < dimensions; i++) mean[i] /= vectors.length;
  return normalizeVector(mean);
}

function farthestIndex(vectors, centers, used) {
  let best = -1;
  let bestDistance = -1;
  for (let i = 0; i < vectors.length; i++) {
    if (used.has(i)) continue;
    let nearest = Infinity;
    for (const center of centers) nearest = Math.min(nearest, 1 - similarity(vectors[i], center));
    if (!centers.length) nearest = 1;
    if (nearest > bestDistance) {
      bestDistance = nearest;
      best = i;
    }
  }
  return best;
}

function kmeans(vectorsInput, requestedK, iterations = 14) {
  const vectors = (vectorsInput || []).map(normalizeVector).filter(vector => vector.length);
  if (!vectors.length) return { assignments: [], centers: [] };
  const dimensions = vectors[0].length;
  const k = Math.max(1, Math.min(Math.round(Number(requestedK || 1)), vectors.length));
  const centers = [];
  const used = new Set();
  centers.push(vectors[0]);
  used.add(0);
  while (centers.length < k) {
    const index = farthestIndex(vectors, centers, used);
    if (index < 0) break;
    centers.push(vectors[index]);
    used.add(index);
  }
  let assignments = new Array(vectors.length).fill(0);
  for (let iteration = 0; iteration < iterations; iteration++) {
    let changed = false;
    for (let i = 0; i < vectors.length; i++) {
      let best = 0;
      let bestSimilarity = -Infinity;
      for (let c = 0; c < centers.length; c++) {
        const score = similarity(vectors[i], centers[c]);
        if (score > bestSimilarity) {
          bestSimilarity = score;
          best = c;
        }
      }
      if (assignments[i] !== best) {
        assignments[i] = best;
        changed = true;
      }
    }
    const groups = centers.map(() => []);
    assignments.forEach((cluster, index) => groups[cluster].push(vectors[index]));
    for (let c = 0; c < centers.length; c++) {
      if (groups[c].length) centers[c] = meanVector(groups[c], dimensions);
      else {
        const index = farthestIndex(vectors, centers, new Set());
        if (index >= 0) centers[c] = vectors[index];
      }
    }
    if (!changed && iteration > 1) break;
  }
  return { assignments, centers };
}

function clusterEvidence(items, vectorsInput, requestedK) {
  const vectors = (vectorsInput || []).map(normalizeVector);
  const { assignments, centers } = kmeans(vectors, requestedK);
  const clusters = centers.map((center, index) => ({ id: index + 1, center, members: [] }));
  assignments.forEach((clusterIndex, itemIndex) => {
    if (clusters[clusterIndex] && items[itemIndex]) clusters[clusterIndex].members.push({ item: items[itemIndex], vector: vectors[itemIndex] });
  });
  return clusters.filter(cluster => cluster.members.length).map(cluster => {
    const ranked = [...cluster.members].sort((a, b) => {
      const sim = similarity(b.vector, cluster.center) - similarity(a.vector, cluster.center);
      return sim || b.item.quality - a.item.quality;
    });
    const representative = ranked.slice(0, 6).map(entry => entry.item);
    const clusterPosts = cluster.members.filter(entry => entry.item.kind === 'post').map(entry => entry.item.row);
    const clusterComments = cluster.members.filter(entry => entry.item.kind === 'comment').map(entry => entry.item.row);
    const phrases = landscape.candidatePhrases(clusterPosts, clusterComments, 12);
    return {
      id: cluster.id,
      sample_size: cluster.members.length,
      post_sample: clusterPosts.length,
      comment_sample: clusterComments.length,
      phrases,
      representative
    };
  }).sort((a, b) => b.sample_size - a.sample_size || a.id - b.id);
}

function evidenceText(clusters, maxChars = 62000) {
  const parts = [];
  let chars = 0;
  for (const cluster of clusters || []) {
    const header = `CLUSTER ${cluster.id} | sample ${cluster.sample_size} | posts ${cluster.post_sample} | comments ${cluster.comment_sample} | signals: ${(cluster.phrases || []).map(p => p.phrase).slice(0, 8).join(', ')}`;
    const lines = [header, ...cluster.representative.map(item => `- ${item.text}`), ''];
    for (const line of lines) {
      if (chars + line.length + 1 > maxChars) return parts.join('\n');
      parts.push(line);
      chars += line.length + 1;
    }
  }
  return parts.join('\n');
}

module.exports = { sampleCorpus, normalizeVector, similarity, kmeans, clusterEvidence, evidenceText };
