const test = require('node:test');
const assert = require('node:assert/strict');

const { _test } = require('../api/search.js');

test('Arctic Shift search URLs use supported fields and inclusive end-date boundary', () => {
  const input = 'https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=TheTowerGame&after=2026-08-20&before=2026-09-05&sort=desc&limit=auto&fields=id%2Cauthor%2Ccreated_utc%2Ctitle%2Cselftext%2Cscore%2Cnum_comments%2Curl%2Cpermalink%2Csubreddit';
  const rewritten = _test.rewriteArcticUrl(input);
  assert.ok(rewritten);
  const url = new URL(rewritten.url);
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
