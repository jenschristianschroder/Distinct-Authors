const test = require('node:test');
const assert = require('node:assert/strict');

const { _test } = require('../api/search.js');

test('Arctic Shift search URLs avoid unsupported keyword mode and use inclusive end-date boundary', () => {
  const input = 'https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=TheTowerGame&after=2026-08-20&before=2026-09-05&sort=desc&limit=auto&query=Daily%20gem%20cap&fields=id%2Cauthor%2Ccreated_utc%2Ctitle%2Cselftext%2Cscore%2Cnum_comments%2Curl%2Cpermalink%2Csubreddit';
  const rewritten = _test.rewriteArcticUrl(input);
  assert.ok(rewritten);
  const url = new URL(rewritten.url);
  assert.equal(rewritten.term, 'Daily gem cap');
  assert.equal(url.searchParams.has('query'), false);
  assert.equal(url.searchParams.get('before'), '2026-09-06');
  assert.equal(url.searchParams.get('fields').includes('permalink'), false);
  assert.equal(url.searchParams.get('fields').includes('url'), true);
});

test('Arctic Shift rows get synthetic Reddit permalinks', () => {
  const postPayload = { data: [{ id: 'p123', subreddit: 'TheTowerGame', title: 'Gem cap' }] };
  const post = _test.enrichArcticPayload(postPayload, 'posts', 'TheTowerGame').data[0];
  assert.equal(post.permalink, '/r/TheTowerGame/comments/p123/');

  const commentPayload = { data: [{ id: 'c456', link_id: 't3_p123', subreddit: 'TheTowerGame', body: 'Raise it' }] };
  const comment = _test.enrichArcticPayload(commentPayload, 'comments', 'TheTowerGame').data[0];
  assert.equal(comment.permalink, '/r/TheTowerGame/comments/p123/_/c456/');
});

test('Arctic broad rows are locally filtered by the generated search term', () => {
  const post = { title: 'Gem cap needs to be raised', selftext: 'Daily limit discussion' };
  assert.equal(_test.rowMatchesTerm(post, 'posts', 'gem cap'), true);
  assert.equal(_test.rowMatchesTerm(post, 'posts', 'tournament rewards'), false);
  const comment = { body: 'The daily gem cap should be higher.' };
  assert.equal(_test.rowMatchesTerm(comment, 'comments', 'daily gem cap'), true);
});

test('Arctic broad backfill slices comments more finely than posts', () => {
  const comments = _test.makeSlices('2026-08-20', '2026-09-06', 'comments');
  const posts = _test.makeSlices('2026-08-20', '2026-09-06', 'posts');
  assert.ok(comments.length > posts.length);
  assert.equal(comments[0][0], '2026-08-20');
  assert.equal(comments.at(-1)[1], '2026-09-06');
});
