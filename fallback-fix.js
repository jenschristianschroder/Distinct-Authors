'use strict';

// Fallback for Arctic Shift created_utc aggregates that return unusable zero counts.
// Author aggregates are working reliably, so synthesize time buckets from them when needed.
(function () {
  const originalAggregateMap = aggregateMap;
  const originalDetermineGranularity = determineGranularity;

  window.determineGranularity = function determineGranularityFixed(start, end) {
    const choice = $('timeGranularity').value;
    if (choice !== 'auto') return choice;
    const days = Math.ceil((new Date(end + 'T00:00:00Z') - new Date(start + 'T00:00:00Z')) / 86400000);
    if (days <= 14) return 'day';
    if (days <= 370) return 'week';
    return 'month';
  };

  window.aggregateMap = async function aggregateMapFixed(kind, aggregateType, subreddit, after, before, opts = {}) {
    const result = await originalAggregateMap(kind, aggregateType, subreddit, after, before, opts);
    if (aggregateType !== 'created_utc') return result;

    const parsedTotal = Math.round(sumMap(result));
    if (parsedTotal > 0) return result;

    const frequency = opts.frequency || '';
    let slices;
    if (frequency === 'month') slices = makeMonthlySlices(after, before);
    else if (frequency === 'day') slices = makeFixedSlices(after, before, 1);
    else slices = makeFixedSlices(after, before, 7);

    planned += slices.length;
    log(`${kind} ${frequency || 'time'} aggregate parsed as zero; rebuilding ${slices.length} bucket(s) from author counts`);

    const fallback = new Map();
    for (const [sliceStart, sliceEnd] of slices) {
      const authorMap = await originalAggregateMap(kind, 'author', subreddit, sliceStart, sliceEnd, { label: `fallback/${frequency || 'time'}` });
      const count = Math.round(sumMap(authorMap));
      const label = frequency === 'month' ? sliceStart.slice(0, 7) : sliceStart;
      fallback.set(label, count);
    }
    return fallback;
  };
})();
