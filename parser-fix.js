'use strict';

// Arctic Shift aggregation counts may be returned as JSON numbers or as
// stringified PostgreSQL bigint values. The original parser only accepted
// numbers, which caused valid aggregate buckets to be discarded as zero.
(function () {
  function numeric(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  }

  window.countValue = function countValueFixed(obj) {
    if (!obj || typeof obj !== 'object') return null;
    const keys = ['count', 'doc_count', 'value', 'total', 'num', 'n', 'count_all'];
    for (const key of keys) {
      const parsed = numeric(obj[key]);
      if (parsed !== null) return parsed;
    }
    return null;
  };

  window.extractAggregateCounts = function extractAggregateCountsFixed(payload, aggregateType, frequency) {
    const map = new Map();
    const metaKeys = new Set(['error','message','detail','status','_meta','meta','took']);

    const add = (key, value) => {
      if (key == null || key === '') return;
      const parsed = numeric(value);
      if (parsed === null) return;
      map.set(String(key), (map.get(String(key)) || 0) + parsed);
    };

    const normalizeKey = (key) => {
      if (aggregateType === 'created_utc') return normalizeTimeBucket(key, frequency);
      return key == null ? null : String(key);
    };

    const maybePair = (obj) => {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
      const count = window.countValue(obj);
      if (count === null) return false;

      const authorKeys = ['author', 'key', 'name', 'label', 'bucket'];
      const timeKeys = ['created_utc', 'key', 'name', 'label', 'date', 'bucket', 'time', 'timestamp'];
      const keys = aggregateType === 'author' ? authorKeys : timeKeys;

      for (const keyName of keys) {
        const rawKey = obj[keyName];
        if (typeof rawKey === 'string' || typeof rawKey === 'number') {
          const key = normalizeKey(rawKey);
          if (key != null) add(key, count);
          return true;
        }
      }
      return false;
    };

    const visit = (node) => {
      if (node == null) return;

      if (Array.isArray(node)) {
        // Some APIs serialize aggregate rows as [key, count].
        if (node.length === 2 && (typeof node[0] === 'string' || typeof node[0] === 'number') && numeric(node[1]) !== null) {
          const key = normalizeKey(node[0]);
          if (key != null) add(key, node[1]);
          return;
        }
        node.forEach(visit);
        return;
      }

      if (typeof node !== 'object') return;
      if (maybePair(node)) return;

      const entries = Object.entries(node);
      if (entries.length) {
        const allNumericish = entries.every(([key, value]) => {
          if (metaKeys.has(key)) return false;
          return numeric(value) !== null || (value && typeof value === 'object' && window.countValue(value) !== null);
        });

        if (allNumericish) {
          for (const [rawKey, rawValue] of entries) {
            const count = numeric(rawValue) !== null ? numeric(rawValue) : window.countValue(rawValue);
            const key = normalizeKey(rawKey);
            if (key != null) add(key, count);
          }
          return;
        }
      }

      for (const [key, value] of entries) {
        if (!metaKeys.has(key)) visit(value);
      }
    };

    visit(payload);
    return map;
  };
})();
