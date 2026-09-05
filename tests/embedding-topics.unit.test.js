'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const embedding = require('../lib/embedding-topics');
const topicsApi = require('../api/topics');

test('kmeans separates clearly different embedding groups', () => {
  const vectors = [
    [1, 0, 0], [0.98, 0.05, 0], [0.97, -0.03, 0],
    [0, 1, 0], [0.04, 0.99, 0], [-0.02, 0.98, 0]
  ];
  const result = embedding.kmeans(vectors, 2);
  assert.equal(result.centers.length, 2);
  const first = new Set(result.assignments.slice(0, 3));
  const second = new Set(result.assignments.slice(3));
  assert.equal(first.size, 1);
  assert.equal(second.size, 1);
  assert.notEqual([...first][0], [...second][0]);
});

test('sample corpus keeps both posts and comments', () => {
  const posts = Array.from({ length: 30 }, (_, i) => ({ id:`p${i}`, created_utc:1000+i, title:`Module upgrade ${i}`, selftext:'reroll shards and modules', score:i, num_comments:i }));
  const comments = Array.from({ length: 50 }, (_, i) => ({ id:`c${i}`, created_utc:2000+i, body:`Comment about gem cap ${i}`, score:i%5 }));
  const sample = embedding.sampleCorpus(posts, comments, 40);
  assert.equal(sample.length, 40);
  assert.ok(sample.some(item => item.kind === 'post'));
  assert.ok(sample.some(item => item.kind === 'comment'));
});

test('topic cost estimator uses Nano and embedding prices', () => {
  const cost = topicsApi._test.costSummary(
    'gpt-5-nano',
    { input_tokens: 100000, output_tokens: 10000, input_tokens_details: { cached_tokens: 0 } },
    'text-embedding-3-small',
    { total_tokens: 50000 }
  );
  assert.ok(Math.abs(cost.topic_usd - 0.009) < 1e-9);
  assert.ok(Math.abs(cost.embedding_usd - 0.001) < 1e-9);
  assert.ok(Math.abs(cost.estimated_usd - 0.01) < 1e-9);
});
