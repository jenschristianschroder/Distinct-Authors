const { test, expect } = require('@playwright/test');

const fixture = {
  subreddit: 'TheTowerGame',
  topic: 'Daily gem cap',
  start: '2026-08-06',
  end: '2026-09-05',
  model: 'gpt-5.6-luna',
  terms: ['Daily gem cap', 'gem cap', 'daily gems'],
  semanticAngles: ['daily ad gem limit'],
  posts: [{
    id: 'p1', author: 'alpha', created_utc: 1787918400,
    title: 'Gem Cap needs to be raised', selftext: 'The daily gem cap feels too low.',
    score: 42, score_known: true, num_comments: 18,
    permalink: '/r/TheTowerGame/comments/p1/gem_cap_needs_to_be_raised/', subreddit: 'TheTowerGame',
    sources: ['openai_web']
  }],
  comments: [{
    id: 'c1', author: 'beta', created_utc: 1788004800,
    body: 'I would like a higher daily cap too.', score: 8, score_known: true,
    link_id: 't3_p1', parent_id: '',
    permalink: '/r/TheTowerGame/comments/p1/gem_cap_needs_to_be_raised/c1/', subreddit: 'TheTowerGame',
    sources: ['openai_web']
  }],
  linkedPosts: [{
    id: 'p1', author: 'alpha', created_utc: 1787918400,
    title: 'Gem Cap needs to be raised', selftext: 'The daily gem cap feels too low.',
    score: 42, score_known: true, num_comments: 18,
    permalink: '/r/TheTowerGame/comments/p1/gem_cap_needs_to_be_raised/', subreddit: 'TheTowerGame',
    sources: ['openai_web']
  }],
  summary: 'Overall read\nThe retrieved sample leans toward raising the daily gem cap.',
  stats: {
    searchDepth: 'thorough', aiWebPasses: 2, webQueries: 10, webSources: 15, webPostIds: 8,
    webReportedRecords: 2, webExtractedPosts: 1, webExtractedComments: 1,
    redditNativeRequests: 3, redditNativeFailures: 3, redditNativePosts: 0,
    redditPostsAttempted: 8, redditScrapeFailures: 8, redditLivePosts: 0, redditLiveComments: 0,
    arcticRequests: 12, arcticRequestFailures: 12, arcticPosts: 0, arcticComments: 0,
    mergedPosts: 1, mergedComments: 1
  },
  warnings: [],
  webSources: [{ url: 'https://www.reddit.com/r/TheTowerGame/comments/p1/gem_cap_needs_to_be_raised/', title: 'Gem cap' }]
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('sentimentAppToken', 'test-token');
    localStorage.setItem('sentimentSearchBackend', 'https://distinct-authors.vercel.app/api/search');
  });
});

test('hybrid sentiment UI is current and renders retrieved data', async ({ page }) => {
  await page.route('**/api/search', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) });
  });

  await page.goto('/sentiment.html');
  await expect(page.getByLabel('Topic or concept')).toBeVisible();
  await expect(page.getByLabel('Search depth')).toHaveValue('thorough');
  await expect(page.getByRole('button', { name: 'Search & analyze' })).toBeVisible();

  await page.getByLabel('Topic or concept').fill('Daily gem cap');
  await page.getByLabel('Start date').fill('2026-08-06');
  await page.getByLabel('End date').fill('2026-09-05');
  await page.getByRole('button', { name: 'Search & analyze' }).click();

  await expect(page.locator('#kpiItems')).toHaveText('2');
  await expect(page.locator('#sampleMeta')).toContainText('1 posts');
  await expect(page.locator('#sampleMeta')).toContainText('1 comments');
  await expect(page.locator('#llmSummaryCard')).toBeVisible();
  await expect(page.locator('#llmSummary')).toContainText('raising the daily gem cap');
  await expect(page.locator('#coverageNote')).toContainText('15 Reddit URLs');
  await expect(page.locator('#error')).toBeHidden();
});

test('empty backend response produces a useful error', async ({ page }) => {
  await page.route('**/api/search', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...fixture, posts: [], comments: [], linkedPosts: [], summary: '', warnings: [] })
    });
  });

  await page.goto('/sentiment.html');
  await page.getByLabel('Topic or concept').fill('Daily gem cap');
  await page.getByLabel('Start date').fill('2026-08-06');
  await page.getByLabel('End date').fill('2026-09-05');
  await page.getByRole('button', { name: 'Search & analyze' }).click();
  await expect(page.locator('#error')).toContainText('No analyzable Reddit contributions were retrieved');
});

test('production API returns analyzable Daily gem cap evidence', async ({ request }) => {
  test.skip(!process.env.APP_ACCESS_TOKEN, 'Add APP_ACCESS_TOKEN as a GitHub Actions repository secret to enable the live integration test.');
  const base = process.env.LIVE_BASE_URL || 'https://distinct-authors.vercel.app';
  const response = await request.post(`${base}/api/search`, {
    headers: { 'X-App-Token': process.env.APP_ACCESS_TOKEN },
    data: {
      subreddit: 'TheTowerGame',
      topic: 'Daily gem cap',
      start: '2026-08-06',
      end: '2026-09-05',
      depth: 'standard',
      maxItems: 150
    },
    timeout: 120000
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const data = await response.json();
  expect(Number(data?.stats?.webSources || 0)).toBeGreaterThan(0);
  expect((data.posts?.length || 0) + (data.comments?.length || 0)).toBeGreaterThan(0);
});
