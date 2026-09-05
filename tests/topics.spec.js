const { test, expect } = require('@playwright/test');

const fixture = {
  subreddit:'TheTowerGame', start:'2026-08-23', end:'2026-09-05', model:'gpt-5.6-luna',
  overview:'The subreddit is mainly discussing the daily gem cap and module progression.',
  cross_topic_patterns:['Players connect reward limits with progression speed.'],
  caveats:['The archive is a broad sample rather than a complete Reddit census.'],
  overall_sentiment:{positive:40,neutral:70,negative:30},
  candidate_phrases:[{phrase:'gem cap',count:24.2},{phrase:'new modules',count:18.1}],
  stats:{posts_scanned:40,comments_scanned:100,known_voices:55,topics_found:2,archive_failures:0,assigned_contributions:100,total_contributions:140},
  topics:[
    {
      name:'Daily gem cap',description:'Discussion about the daily ad-gem claim limit.',keywords:['gem cap','daily gem limit'],confidence:'high',
      opinions:[{stance:'negative',summary:'Many users want the cap raised or removed.'},{stance:'mixed',summary:'Some users accept a limit but want clearer tracking.'}],
      disagreements:['Users disagree about what counts toward the cap.'],posts:14,comments:46,contributions:60,share:.6,average_post_score:48.2,
      sentiment:{positive:8,neutral:24,negative:28},top_authors:[{author:'alice',count:3}],top_commenters:[{author:'bob',count:5}],
      popular_posts:[{title:'Gem Cap needs to be raised',url:'https://www.reddit.com/r/TheTowerGame/comments/p1/',score:150,num_comments:80,author:'alice'}],
      representative:[{kind:'comment',author:'bob',sentiment:'negative',text:'The cap makes progression too slow.',score:8}]
    },
    {
      name:'Modules',description:'Discussion of module upgrades and reroll progression.',keywords:['modules','reroll'],confidence:'medium',
      opinions:[{stance:'positive',summary:'Some players like the new module quality-of-life changes.'}],disagreements:[],posts:10,comments:30,contributions:40,share:.4,average_post_score:32,
      sentiment:{positive:20,neutral:15,negative:5},top_authors:[],top_commenters:[],popular_posts:[],representative:[]
    }
  ]
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('sentimentAppToken','test-token'));
  await page.route('**/api/topics', async route => route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fixture)}));
});

test('topic landscape renders discovered topics and opinions', async ({ page }) => {
  await page.goto('/topics.html');
  await expect(page.getByRole('heading',{name:'Subreddit Topic Landscape'})).toBeVisible();
  await page.getByLabel('Start date').fill('2026-08-23');
  await page.getByLabel('End date').fill('2026-09-05');
  await page.getByRole('button',{name:'Analyze subreddit topics'}).click();
  await expect(page.locator('#kpiContributions')).toHaveText('140');
  await expect(page.locator('#topicCards')).toContainText('Daily gem cap');
  await expect(page.locator('#topicCards')).toContainText('Many users want the cap raised or removed.');
  await expect(page.locator('#topicCards')).toContainText('u/bob');
  await expect(page.locator('#error')).toBeHidden();
});

test('topic landscape has no horizontal overflow on phone', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/topics.html');
  await page.getByLabel('Start date').fill('2026-08-23');
  await page.getByLabel('End date').fill('2026-09-05');
  await page.getByRole('button',{name:'Analyze subreddit topics'}).click();
  await expect(page.locator('#topicCards')).toContainText('Modules');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
