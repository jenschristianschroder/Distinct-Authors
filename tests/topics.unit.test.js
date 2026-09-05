'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const landscape = require('../lib/topic-landscape');

const posts = [
  { id:'p1', author:'alice', title:'Daily gem cap is broken', selftext:'The gem cap should be raised because progression is too slow.', score:20, num_comments:12 },
  { id:'p2', author:'bob', title:'New module changes', selftext:'I love the module improvements and new reroll options.', score:10, num_comments:5 }
];
const comments = [
  { id:'c1', author:'carol', body:'The daily gem limit is frustrating and unfair.', score:5 },
  { id:'c2', author:'dave', body:'Modules feel much better after the update.', score:3 }
];

test('sentiment classifier preserves positive and negative direction', () => {
  assert.equal(landscape.sentiment('I love this excellent improvement').label, 'positive');
  assert.equal(landscape.sentiment('This broken change is awful and frustrating').label, 'negative');
});

test('candidate phrase extraction surfaces repeated substantive terms', () => {
  const phrases = landscape.candidatePhrases(posts, comments, 30).map(row => row.phrase);
  assert.ok(phrases.some(value => value.includes('gem')));
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
