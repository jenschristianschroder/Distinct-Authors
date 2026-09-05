const { test, expect } = require('@playwright/test');

const fixture = {
  subreddit: 'TheTowerGame',
  topic: 'Daily gem cap',
  start: '2026-08-07',
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
    archiveThreadComments: 1, unresolvedPostAuthors: 0, unresolvedCommentAuthors: 0,
    mergedPosts: 1, mergedComments: 1
  },
  warnings: [],
  webSources: [{ url: 'https://www.reddit.com/r/TheTowerGame/comments/p1/gem_cap_needs_to_be_raised/', title: 'Gem cap' }]
};

async function githubActionsOidcToken() {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!requestUrl || !requestToken) return '';
  const joiner = requestUrl.includes('?') ? '&' : '?';
  const response = await fetch(`${requestUrl}${joiner}audience=distinct-authors-ci`, {
    headers: { Authorization: `Bearer ${requestToken}` }
  });
  if (!response.ok) throw new Error(`Unable to obtain GitHub OIDC token: HTTP ${response.status}`);
  const payload = await response.json();
  return String(payload?.value || '');
}

async function productionSearch(request) {
  const base = process.env.LIVE_BASE_URL || 'https://distinct-authors.vercel.app';
  if (process.env.APP_ACCESS_TOKEN) {
    return request.post(`${base}/api/search`, {
      headers: { 'X-App-Token': process.env.APP_ACCESS_TOKEN },
      data: {
        subreddit: 'TheTowerGame',
        topic: 'Daily gem cap',
        start: '2026-08-07',
        end: '2026-09-05',
        depth: 'thorough',
        maxItems: 500
      },
      timeout: 120000
    });
  }

  const oidc = await githubActionsOidcToken();
  if (!oidc) return null;
  let response = null;
  for (let attempt = 0; attempt < 7; attempt++) {
    response = await request.post(`${base}/api/ci-search`, {
      headers: { Authorization: `Bearer ${oidc}` },
      timeout: 120000
    });
    if (![404, 503].includes(response.status())) return response;
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  return response;
}

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
  await page.getByLabel('Start date').fill('2026-08-07');
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

test('topic sentiment date inputs enforce a 30-day inclusive maximum', async ({ page }) => {
  await page.goto('/sentiment.html');
  const start=page.getByLabel('Start date'),end=page.getByLabel('End date');
  await start.fill('2026-08-01');
  await expect(end).toHaveAttribute('min','2026-08-01');
  await expect(end).toHaveAttribute('max','2026-08-30');
  await end.fill('2026-09-05');
  await expect(start).toHaveValue('2026-08-07');
});

test('unavailable usernames are excluded from unique voices and voice rankings', async ({ page }) => {
  const unavailableFixture = {
    ...fixture,
    posts: [
      ...fixture.posts,
      { ...fixture.posts[0], id: 'p2', author: '[unknown]', title: 'Another gem cap post', permalink: '/r/TheTowerGame/comments/p2/another/' }
    ],
    linkedPosts: [
      ...fixture.linkedPosts,
      { ...fixture.linkedPosts[0], id: 'p2', author: '[unknown]', title: 'Another gem cap post', permalink: '/r/TheTowerGame/comments/p2/another/' }
    ],
    stats: { ...fixture.stats, mergedPosts: 2, unresolvedPostAuthors: 1 }
  };
  await page.route('**/api/search', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(unavailableFixture) });
  });

  await page.goto('/sentiment.html');
  await page.getByLabel('Topic or concept').fill('Daily gem cap');
  await page.getByLabel('Start date').fill('2026-08-07');
  await page.getByLabel('End date').fill('2026-09-05');
  await page.getByRole('button', { name: 'Search & analyze' }).click();

  await expect(page.locator('#kpiAuthors')).toHaveText('2');
  await expect(page.locator('#voicesSection')).not.toContainText('[unknown]');
  await expect(page.locator('#coverageNote')).toContainText('excluded from voice counts');
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
  await page.getByLabel('Start date').fill('2026-08-07');
  await page.getByLabel('End date').fill('2026-09-05');
  await page.getByRole('button', { name: 'Search & analyze' }).click();
  await expect(page.locator('#error')).toContainText('No analyzable Reddit contributions were retrieved');
});

test('production API returns broad Daily gem cap coverage', async ({ request }) => {
  const response = await productionSearch(request);
  test.skip(!response, 'Live authentication is only available in GitHub Actions or when APP_ACCESS_TOKEN is configured.');
  expect(response.ok(), await response.text()).toBeTruthy();
  const data = await response.json();
  expect(Number(data?.stats?.webSources || 0)).toBeGreaterThan(0);
  // Arctic Shift's auto limit varies with server capacity, so assert useful broad coverage rather than a brittle exact corpus size.
  expect(Number(data?.stats?.archiveBroadCommentsScanned || 0)).toBeGreaterThan(10000);
  expect(Number(data?.stats?.archiveTopicComments || 0)).toBeGreaterThan(0);
  expect(data.posts?.length || 0).toBeGreaterThanOrEqual(50);
  expect(data.comments?.length || 0).toBeGreaterThanOrEqual(100);
  expect(Number(data?.stats?.archiveThreadComments || 0)).toBeGreaterThanOrEqual(data.comments?.length || 0);
  expect(Number(data?.stats?.unresolvedCommentAuthors || 0)).toBe(0);
});
