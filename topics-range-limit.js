'use strict';

(() => {
  const MAX_RANGE_DAYS = 30;
  const start = document.getElementById('start');
  const end = document.getElementById('end');
  if (!start || !end) return;

  function addDaysIso(value, days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return '';
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return '';
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function syncFromStart() {
    if (!start.value) return;
    const maxEnd = addDaysIso(start.value, MAX_RANGE_DAYS - 1);
    end.min = start.value;
    end.max = maxEnd;
    if (!end.value || end.value < start.value) end.value = start.value;
    else if (maxEnd && end.value > maxEnd) end.value = maxEnd;
    syncStartBounds();
  }

  function syncStartBounds() {
    if (!end.value) return;
    const minStart = addDaysIso(end.value, -(MAX_RANGE_DAYS - 1));
    start.min = minStart;
    start.max = end.value;
  }

  function syncFromEnd() {
    if (!end.value) return;
    const minStart = addDaysIso(end.value, -(MAX_RANGE_DAYS - 1));
    start.min = minStart;
    start.max = end.value;
    if (!start.value || start.value > end.value) start.value = end.value;
    else if (minStart && start.value < minStart) start.value = minStart;
    syncFromStart();
  }

  start.addEventListener('input', syncFromStart);
  start.addEventListener('change', syncFromStart);
  end.addEventListener('input', syncFromEnd);
  end.addEventListener('change', syncFromEnd);
  syncFromStart();
})();
