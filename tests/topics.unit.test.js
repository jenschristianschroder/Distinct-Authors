'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const landscape = require('../lib/topic-landscape');
const corpusQuality = require('../lib/corpus-quality');
const topicsApi = require('../api/topics');

const posts = [
  { id:'p1', author:'alice', title:'Daily gem cap is broken', selftext:'The gem cap should be raised because progression is too slow.', score:20, num_comments:12 },
  { id:'p2', author:'bob', title:'New module changes', selftext:'I love the module improvements and new reroll options.', score:10, num_comments:5 }
];
const comments = [
  { id:'c1', author:'carol', body:'The daily gem limit is frustrating and unfair.', score:5 },
  { id:'c2', author:'dave', body:'The module improvements feel much better after the update.', score:3 }
];

test('sentiment classifier preserves positive and negative direction', () => {
  assert.equal(landscape.sentiment('I love this excellent improvement').label, 'positive');
  assert.equal(landscape.sentiment('This broken change is awful and frustrating').label, 'negative');
});

test('candidate phrase extraction surfaces repeated substantive terms', () => {
  const phrases = landscape.candidatePhrases(posts, comments, 30).map(row => row.phrase);
  assert.ok(phrases.includes('module improvements'));
});

test('topic assignment separates gem cap and module discussion', () => {
  const topics = [
    { name:'Daily gem cap', keywords:['gem cap','daily gem limit'] },
    { name:'Modules', keywords:['modules','module changes','reroll'] }
  ];
  const buckets = landscape.primaryAssignments(posts, comments, topics);
  assert.equal(buckets[0].posts.length, 1);
  assert.equal(buckets[0].comments.length, 1);
  assert.equal(buckets[1].posts.length, 1);
  assert.equal(buckets[1].comments.length, 1);
});

test('unknown authors are excluded from voice rankings', () => {
  const voices = landscape.rankVoices([{ author:'[unknown]' }, { author:'alice' }, { author:'alice' }, { author:'[deleted]' }]);
  assert.deepEqual(voices, [{ author:'alice', count:2 }]);
});

test('topic landscape range is capped at 30 inclusive days', () => {
  assert.equal(topicsApi._test.MAX_RANGE_DAYS, 30);
  assert.equal(topicsApi._test.inclusiveDays('2026-08-07', '2026-09-05'), 30);
  assert.equal(topicsApi._test.inclusiveDays('2026-08-06', '2026-09-05'), 31);
});

test('unicode normalization preserves multilingual words instead of mangling them', () => {
  assert.equal(landscape.normalize('İstanbul metrolarının isimlendirmeleri'), 'istanbul metrolarının isimlendirmeleri');
  assert.match(landscape.normalize('東京の交通'), /東京/u);
});

test('general corpus quality filter removes automation, placeholders, and repeated boilerplate', () => {
  const boilerplate = 'This is an automated moderation message with enough repeated wording to be treated as boilerplate content for topic discovery.';
  const noisyComments = [
    { author:'AutoModerator', body:'Please contact the moderators of this subreddit if you have questions.' },
    { author:'Example-ModTeam', body:'Moderator announcement.' },
    { author:'person1', body:'[removed]' },
    ...Array.from({length:6}, (_, index) => ({ author:`user${index}`, body:boilerplate })),
    { author:'traveler', body:'The metro extension changed my commute and the new station is useful.' }
  ];
  const filtered = corpusQuality.filterCorpus([], noisyComments, 'Example');
  assert.equal(filtered.comments.length, 1);
  assert.equal(filtered.comments[0].author, 'traveler');
  assert.equal(filtered.stats.automation_removed, 2);
  assert.equal(filtered.stats.repeated_boilerplate_removed, 6);
  assert.equal(filtered.stats.placeholder_removed, 1);
});

test('subreddit name is treated as context rather than a topic keyword', () => {
  const cityPosts = [
    { title:'ExampleCity metro delays', selftext:'Metro service is delayed again near the central station.' },
    { title:'ExampleCity metro extension', selftext:'New metro line opening discussion and station access.' },
    { title:'ExampleCity food prices', selftext:'Restaurant prices increased this month.' }
  ];
  const phrases = landscape.candidatePhrases(cityPosts, [], 30, { contextTerms:['ExampleCity'] }).map(row => row.phrase);
  assert.equal(phrases.includes('examplecity'), false);
  assert.ok(phrases.some(value => value.includes('metro')));
  const score = landscape.topicScore(cityPosts[0], 'post', { name:'ExampleCity', keywords:['ExampleCity'] }, { contextTerms:['ExampleCity'] });
  assert.equal(score, 0);
});

test('generic cluster labels are rejected independently of subreddit identity', () => {
  assert.equal(topicsApi._test.topicNameIsGeneric('Discussion Cluster 3', 'Anything'), true);
  assert.equal(topicsApi._test.topicNameIsGeneric('Experience', 'Anything'), true);
  assert.equal(topicsApi._test.topicNameIsGeneric('Anything', 'Anything'), true);
  assert.equal(topicsApi._test.topicNameIsGeneric('Public transport reliability', 'Anything'), false);
});

test('AI sentiment percentages normalize and weight across mapped contributions', () => {
  const normalized = topicsApi._test.normalizeSentimentPercent({ positive: 2, neutral: 6, negative: 2 });
  assert.equal(Math.round(normalized.positive), 20);
  assert.equal(Math.round(normalized.neutral), 60);
  const overall = topicsApi._test.weightedOverallSentiment([
    { contributions:100, sentiment:{ positive:20, neutral:60, negative:20 } },
    { contributions:50, sentiment:{ positive:5, neutral:20, negative:25 } }
  ], { positive:0, neutral:0,negative:0 });
  assert.deepEqual(overall, { positive:25, neutral:80, negative:45 });
});
