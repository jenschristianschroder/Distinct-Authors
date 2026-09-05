const test = require('node:test');
const assert = require('node:assert/strict');

const { _test } = require('../api/search.js');

function responseWithJson(value) {
  return {
    output: [{
      type: 'message',
      content: [{ type: 'output_text', text: JSON.stringify(value) }]
    }]
  };
}

test('OpenAI web records become analyzable post and comment rows', () => {
  const payload = responseWithJson({
    records: [
      {
        kind: 'post',
        url: 'https://www.reddit.com/r/TheTowerGame/comments/abc123/gem_cap_needs_to_be_raised/',
        post_id: 'abc123',
        comment_id: '',
        author: 'alpha',
        date: '2026-08-28',
        title: 'Gem Cap needs to be raised',
        text: 'The daily gem cap feels too low.',
        score: 42,
        num_comments: 18
      },
      {
        kind: 'comment',
        url: 'https://www.reddit.com/r/TheTowerGame/comments/abc123/gem_cap_needs_to_be_raised/def456/',
        post_id: 'abc123',
        comment_id: 'def456',
        author: 'beta',
        date: '2026-08-29',
        title: '',
        text: 'I would like the cap raised too.',
        score: 8,
        num_comments: -1
      }
    ]
  });

  const result = _test.recordsFromWebOutput(payload, 'TheTowerGame', '2026-08-06', '2026-09-05');
  assert.equal(result.reported, 2);
  assert.equal(result.posts.length, 1);
  assert.equal(result.comments.length, 1);
  assert.equal(result.posts[0].id, 'abc123');
  assert.equal(result.posts[0].source, 'openai_web');
  assert.equal(result.comments[0].id, 'def456');
  assert.equal(result.comments[0].link_id, 't3_abc123');
});

test('web records outside the requested date range are rejected', () => {
  const row = _test.recordToRow({
    kind: 'post',
    url: 'https://www.reddit.com/r/TheTowerGame/comments/abc123/example/',
    post_id: 'abc123',
    author: 'alpha',
    date: '2026-07-01',
    title: 'Example',
    text: 'Daily gem cap',
    score: 1,
    num_comments: 0
  }, 'TheTowerGame', '2026-08-06', '2026-09-05');

  assert.equal(row, null);
});

test('direct Reddit data wins over AI-extracted metadata during deduplication', () => {
  const web = [{
    id: 'abc123',
    author: '[unknown]',
    created_utc: 1787918400,
    title: 'Gem Cap needs to be raised',
    selftext: 'AI extracted snippet',
    score: 0,
    score_known: false,
    num_comments: 0,
    subreddit: 'TheTowerGame',
    source: 'openai_web'
  }];

  const live = [{
    id: 'abc123',
    author: 'real_author',
    created_utc: 1787918400,
    title: 'Gem Cap needs to be raised',
    selftext: 'Full Reddit text',
    score: 77,
    score_known: true,
    num_comments: 24,
    subreddit: 'TheTowerGame',
    source: 'reddit_live'
  }];

  const [merged] = _test.mergeRows(web, live);
  assert.equal(merged.author, 'real_author');
  assert.equal(merged.score, 77);
  assert.equal(merged.source, 'reddit_live');
  assert.deepEqual(new Set(merged.sources), new Set(['openai_web', 'reddit_live']));
});

test('non-web OpenAI calls are routed to Nano', () => {
  const routed = _test.routedOpenAIBody({ model:'gpt-5.6-luna', input:'summarize', max_output_tokens:500 });
  assert.equal(routed.model, 'gpt-5-nano');
});

test('web-search OpenAI calls stay on the web-search model', () => {
  const body = { model:'gpt-5.6-luna', tools:[{ type:'web_search' }], input:'search Reddit' };
  assert.equal(_test.routedOpenAIBody(body), body);
  assert.equal(_test.hasWebSearch(body), true);
});
