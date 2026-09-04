async function buildMonthlyAuthorSeries(subreddit, monthlySlices) {
  const authorCountsByMonth = new Map();
  planned += monthlySlices.length * 2;
  for (const [start, end] of monthlySlices) {
    const monthLabel = start.slice(0, 7);
    const posts = filterAuthorMap(await aggregateMap('posts', 'author', subreddit, start, end, { label: 'author/month' }));
    const comments = filterAuthorMap(await aggregateMap('comments', 'author', subreddit, start, end, { label: 'author/month' }));
    const activeAuthors = unionAuthorNames(posts, comments).size;
    authorCountsByMonth.set(monthLabel, activeAuthors);
  }
  return authorCountsByMonth;
}

async function run() {
  const subreddit = $('subreddit').value.trim().replace(/^r\//i, '');
  const start = $('start').value;
  const end = $('end').value;
  if (!subreddit || !start || !end) return showError('Please enter a subreddit and both dates.');
  if (start >= end) return showError('End date must be after the start date.');

  $('run').disabled = true;
  resetState();

  try {
    const granularity = determineGranularity(start, end);
    const monthlySlices = makeMonthlySlices(start, end);
    planned += 6;

    const postAuthorMapRaw = await aggregateMap('posts', 'author', subreddit, start, end, { label: 'author' });
    const commentAuthorMapRaw = await aggregateMap('comments', 'author', subreddit, start, end, { label: 'author' });
    const postAuthorMap = filterAuthorMap(postAuthorMapRaw);
    const commentAuthorMap = filterAuthorMap(commentAuthorMapRaw);

    const postSeriesMap = await aggregateMap('posts', 'created_utc', subreddit, start, end, { frequency: granularity, label: `created/${granularity}` });
    const commentSeriesMap = await aggregateMap('comments', 'created_utc', subreddit, start, end, { frequency: granularity, label: `created/${granularity}` });
    const postMonthSeriesMap = await aggregateMap('posts', 'created_utc', subreddit, start, end, { frequency: 'month', label: 'created/month' });
    const commentMonthSeriesMap = await aggregateMap('comments', 'created_utc', subreddit, start, end, { frequency: 'month', label: 'created/month' });
    const monthlyActiveAuthors = await buildMonthlyAuthorSeries(subreddit, monthlySlices);

    const labels = [...new Set([...postSeriesMap.keys(), ...commentSeriesMap.keys()])].sort();
    const aligned = alignSeries(labels, postSeriesMap, commentSeriesMap);
    const activityLabels = aligned.map(x => periodLabel(granularity, x.label));
    const activityPosts = aligned.map(x => x.a);
    const activityComments = aligned.map(x => x.b);

    const monthLabels = [...new Set([...postMonthSeriesMap.keys(), ...commentMonthSeriesMap.keys(), ...monthlyActiveAuthors.keys()])].sort();
    const monthAuthorValues = monthLabels.map((m) => monthlyActiveAuthors.get(m) || 0);

    const topAuthors = buildTopAuthors(postAuthorMap, commentAuthorMap);
    const allAuthorsSet = unionAuthorNames(postAuthorMap, commentAuthorMap);
    const combinedCounts = new Map();
    for (const author of allAuthorsSet) combinedCounts.set(author, (postAuthorMap.get(author) || 0) + (commentAuthorMap.get(author) || 0));

    const distinctAuthors = allAuthorsSet.size;
    const returningAuthors = [...combinedCounts.values()].filter((v) => v >= 2).length;
    const oneTimeAuthors = [...combinedCounts.values()].filter((v) => v === 1).length;
    const totalPosts = Math.round(sumMap(postSeriesMap));
    const totalComments = Math.round(sumMap(commentSeriesMap));
    const totalContributions = totalPosts + totalComments;
    const totalDays = Math.max(1, Math.ceil((new Date(end + 'T00:00:00Z') - new Date(start + 'T00:00:00Z')) / 86400000));
    const avgPerDay = totalContributions / totalDays;
    const peak = aligned.reduce((best, row) => ((row.a + row.b) > (best.total || -1) ? { label: row.label, total: row.a + row.b } : best), {});

    lastAuthors = [...combinedCounts.keys()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    lastSummary = `r/${subreddit}: ${fmt(distinctAuthors)} distinct authors, ${fmt(returningAuthors)} returning authors, ${fmt(totalPosts)} posts, ${fmt(totalComments)} comments, ${fmt(totalContributions)} total contributions from ${start} to ${end}.`;
    lastJson = {
      subreddit,
      start,
      end,
      granularity,
      totals: {
        distinct_authors: distinctAuthors,
        returning_authors: returningAuthors,
        one_time_authors: oneTimeAuthors,
        posts: totalPosts,
        comments: totalComments,
        contributions: totalContributions,
        average_per_day: Number(avgPerDay.toFixed(2))
      },
      top_authors: topAuthors.slice(0, 50),
      monthly_active_authors: Object.fromEntries(monthlyActiveAuthors.entries()),
      time_series: aligned.map((row) => ({ bucket: row.label, posts: row.a, comments: row.b, total: row.a + row.b }))
    };

    $('summaryTitle').textContent = `r/${subreddit} overview`;
    $('summaryRange').textContent = `${start} to ${end} · timeline grouped by ${granularity}`;
    $('summaryMeta').textContent = `${fmt(totalDays)} day window`;
    $('kpiDistinct').textContent = fmt(distinctAuthors);
    $('kpiReturning').textContent = fmt(returningAuthors);
    $('kpiOneTime').textContent = fmt(oneTimeAuthors);
    $('kpiPosts').textContent = fmt(totalPosts);
    $('kpiComments').textContent = fmt(totalComments);
    $('kpiContributions').textContent = fmt(totalContributions);
    $('kpiAvgDay').textContent = fmt(avgPerDay, 1);
    $('kpiPeak').textContent = peak.label || '—';
    $('kpiPeakSub').textContent = peak.label ? `${fmt(peak.total)} contributions in that ${granularity} bucket` : 'Highest activity bucket';
    $('kpiDistinctSub').textContent = `${fmt(distinctAuthors)} unique usernames after exclusions`;
    $('kpiReturningSub').textContent = `${pct(returningAuthors, distinctAuthors)} of distinct authors returned`;

    const topAuthor = topAuthors[0];
    $('calloutMix').textContent = `${pct(totalPosts, totalContributions)} / ${pct(totalComments, totalContributions)}`;
    $('calloutMixSub').textContent = `Posts / comments (${fmt(totalPosts)} / ${fmt(totalComments)})`;
    $('calloutRetention').textContent = pct(returningAuthors, distinctAuthors);
    $('calloutRetentionSub').textContent = `${fmt(returningAuthors)} returning vs ${fmt(oneTimeAuthors)} one-time authors`;
    $('calloutTopAuthor').textContent = topAuthor ? topAuthor.author : '—';
    $('calloutTopAuthorSub').textContent = topAuthor ? `${fmt(topAuthor.total)} total contributions (${fmt(topAuthor.posts)} posts · ${fmt(topAuthor.comments)} comments)` : 'No author data';

    $('activitySubtitle').textContent = `Posts and comments by ${granularity} bucket.`;
    renderStackedBars('activityChart', activityLabels, activityPosts, activityComments);
    renderLineChart('authorsChart', monthLabels, monthAuthorValues);
    renderComposition(totalPosts, totalComments, distinctAuthors, returningAuthors, oneTimeAuthors);
    renderHorizontalBars('topAuthorsChart', topAuthors);
    renderTopAuthorsTable(topAuthors);
    renderMonthlyCards(monthLabels, postMonthSeriesMap, commentMonthSeriesMap, monthlyActiveAuthors);

    [
      'results','highlightsCard','activitySection','compositionSection','tableSection','aggregatesSection','logPanel'
    ].forEach(id => $(id).classList.remove('hidden'));

    $('progressWrap').classList.remove('hidden');
    $('bar').style.width = '100%';
    $('status').textContent = 'Finished.';
  } catch (err) {
    const hint = (err instanceof TypeError || /failed to fetch/i.test(err.message || ''))
      ? '\n\nThe browser could not reach Arctic Shift. The service may be unavailable or may block cross-origin browser requests.'
      : '';
    showError(`Could not build the dashboard: ${err.message || err}.${hint}`);
    $('status').textContent = 'Stopped.';
  } finally {
    $('run').disabled = false;
  }
}

$('run').addEventListener('click', run);
$('downloadCsv').addEventListener('click', () => {
  if (!lastAuthors.length) return showError('Run the dashboard first.');
  const csv = 'username\n' + lastAuthors.map((name) => `"${String(name).replaceAll('"', '""')}"`).join('\n');
  downloadText('distinct-reddit-authors.csv', csv, 'text/csv;charset=utf-8');
});
$('downloadJson').addEventListener('click', () => {
  if (!lastJson) return showError('Run the dashboard first.');
  downloadText('distinct-reddit-authors-summary.json', JSON.stringify(lastJson, null, 2), 'application/json;charset=utf-8');
});
$('copySummary').addEventListener('click', async () => {
  if (!lastSummary) return showError('Run the dashboard first.');
  try {
    await navigator.clipboard.writeText(lastSummary);
    $('copySummary').textContent = 'Copied';
    setTimeout(() => $('copySummary').textContent = 'Copy text summary', 1200);
  } catch {
    showError('Clipboard access was blocked by the browser.');
  }
});

setDefaults();
