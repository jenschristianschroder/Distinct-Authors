const { test, expect } = require('@playwright/test');

const fixture = {
  model: 'gpt-5.6-luna',
  terms: ['Daily gem cap', 'daily gem limit'],
  posts: [{
    id: 'p1', author: 'alpha', created_utc: 1787918400,
    title: 'Gem cap discussion', selftext: 'The daily gem cap is frustrating.',
    score: 42, num_comments: 18,
    permalink: '/r/TheTowerGame/comments/p1/gem_cap/', subreddit: 'TheTowerGame',
    sources: ['arctic_shift']
  }],
  comments: [{
    id: 'c1', author: 'beta', created_utc: 1788004800,
    body: 'I would like a higher cap.', score: 8,
    link_id: 't3_p1', parent_id: '', subreddit: 'TheTowerGame',
    sources: ['arctic_shift']
  }],
  linkedPosts: [{
    id: 'p1', author: 'alpha', created_utc: 1787918400,
    title: 'Gem cap discussion', selftext: 'The daily gem cap is frustrating.',
    score: 42, num_comments: 18,
    permalink: '/r/TheTowerGame/comments/p1/gem_cap/', subreddit: 'TheTowerGame',
    sources: ['arctic_shift']
  }],
  summary: '## Overall read\nThe sample is **mostly critical**.\n\n## Main opinions\n- **Negative:** Players want a higher cap.\n- **Mixed:** Some users accept the trade-off.\n\n## Coverage caveat\nTreat `thread_context` as contextual evidence.',
  stats: {
    searchDepth: 'thorough', webSources: 12, mergedPosts: 1, mergedComments: 1,
    archiveBroadPostsScanned: 100, archiveBroadCommentsScanned: 900,
    archiveTopicPosts: 12, archiveTopicComments: 25, archiveThreadComments: 80,
    unresolvedPostAuthors: 0, unresolvedCommentAuthors: 0
  },
  warnings: [],
  webSources: []
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('sentimentAppToken', 'test-token');
    localStorage.setItem('sentimentSearchBackend', 'https://distinct-authors.vercel.app/api/search');
  });
  await page.route('**/api/search', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) });
  });
});

test('mobile sentiment layout stays within viewport and KPI cards retain structure', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/sentiment.html');
  await page.getByLabel('Topic or concept').fill('Daily gem cap');
  await page.getByLabel('Start date').fill('2026-08-06');
  await page.getByLabel('End date').fill('2026-09-05');
  await page.getByRole('button', { name: 'Search & analyze' }).click();

  await expect(page.locator('.kpi-grid .kpi')).toHaveCount(6);
  await expect(page.locator('#kpiItems')).toHaveText('2');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  const label = await page.locator('.kpi').first().locator('.kpi-label').boundingBox();
  const value = await page.locator('.kpi').first().locator('.kpi-value').boundingBox();
  expect(label).not.toBeNull();
  expect(value).not.toBeNull();
  expect(value.y).toBeGreaterThan(label.y);
});

test('AI opinion summary renders markdown instead of showing markdown source', async ({ page }) => {
  await page.goto('/sentiment.html');
  await page.getByLabel('Topic or concept').fill('Daily gem cap');
  await page.getByLabel('Start date').fill('2026-08-06');
  await page.getByLabel('End date').fill('2026-09-05');
  await page.getByRole('button', { name: 'Search & analyze' }).click();

  await expect(page.locator('#llmSummary h4').first()).toHaveText('Overall read');
  await expect(page.locator('#llmSummary strong').first()).toHaveText('mostly critical');
  await expect(page.locator('#llmSummary li')).toHaveCount(2);
  await expect(page.locator('#llmSummary code')).toHaveText('thread_context');
  await expect(page.locator('#llmSummary')).not.toContainText('## Overall read');
});
