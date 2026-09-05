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

async function githubActionsOidcToken(){
  const requestUrl=process.env.ACTIONS_ID_TOKEN_REQUEST_URL,requestToken=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if(!requestUrl||!requestToken)return'';
  const joiner=requestUrl.includes('?')?'&':'?';
  const response=await fetch(`${requestUrl}${joiner}audience=distinct-authors-ci`,{headers:{Authorization:`Bearer ${requestToken}`}});
  if(!response.ok)throw new Error(`Unable to obtain GitHub OIDC token: HTTP ${response.status}`);
  return String((await response.json())?.value||'');
}

async function productionTopics(request){
  const oidc=await githubActionsOidcToken();
  if(!oidc)return null;
  const base=process.env.LIVE_BASE_URL||'https://distinct-authors.vercel.app';
  let response=null;
  for(let attempt=0;attempt<8;attempt++){
    response=await request.post(`${base}/api/ci-topics`,{headers:{Authorization:`Bearer ${oidc}`},timeout:120000});
    if(![404,503].includes(response.status()))return response;
    await new Promise(resolve=>setTimeout(resolve,5000));
  }
  return response;
}

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

test('optional focus keywords are sent as data and highlighted in results', async ({ page }) => {
  await page.unroute('**/api/topics');
  let posted=null;
  const focusedFixture={
    ...fixture,
    focus_keywords:['gem cap'],
    stats:{...fixture.stats,focus_keywords:1,focus_topic_matches:1},
    topics:[{...fixture.topics[0],focus_match:true,focus_score:10},fixture.topics[1]]
  };
  await page.route('**/api/topics', async route => {
    posted=route.request().postDataJSON();
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(focusedFixture)});
  });
  await page.goto('/topics.html');
  await page.getByLabel('Start date').fill('2026-08-23');
  await page.getByLabel('End date').fill('2026-09-05');
  await page.locator('#focusKeywords').fill('gem cap');
  await page.getByRole('button',{name:'Analyze subreddit topics'}).click();
  await expect(page.locator('#coverage')).toContainText('Focus keywords: gem cap');
  await expect(page.locator('#topicCards')).toContainText('Focus match');
  expect(posted?.focusKeywords).toBe('gem cap');
});

test('topic landscape date inputs enforce a 30-day inclusive maximum', async ({ page }) => {
  await page.goto('/topics.html');
  const start=page.getByLabel('Start date'),end=page.getByLabel('End date');
  await start.fill('2026-08-01');
  await expect(end).toHaveAttribute('min','2026-08-01');
  await expect(end).toHaveAttribute('max','2026-08-30');
  await end.fill('2026-09-05');
  await expect(start).toHaveValue('2026-08-07');
  await expect(start).toHaveAttribute('min','2026-08-07');
  await expect(start).toHaveAttribute('max','2026-09-05');
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

test('production topic landscape endpoint returns real clustered subreddit data', async ({ request }) => {
  const response=await productionTopics(request);
  test.skip(!response,'Live authentication is only available in GitHub Actions.');
  expect(response.ok(),await response.text()).toBeTruthy();
  const data=await response.json();
  expect(Number(data?.stats?.posts_scanned||0)).toBeGreaterThan(10);
  expect(Number(data?.stats?.comments_scanned||0)).toBeGreaterThan(50);
  expect(data?.topics?.length||0).toBeGreaterThanOrEqual(3);
  expect(Number(data?.stats?.assigned_contributions||0)).toBeGreaterThan(0);
  expect(String(data?.overview||'').length).toBeGreaterThan(40);
});
