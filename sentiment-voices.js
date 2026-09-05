'use strict';

// Keep post authors and commenters separate within each sentiment group.
window.topVoices = function topVoicesByKind(items, label) {
  function rank(kind) {
    const counts = new Map();
    items.filter(x => x.label === label && x.kind === kind).forEach(x => {
      const author = x.author || '[deleted]';
      counts.set(author, (counts.get(author) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }
  return { authors: rank('post'), commenters: rank('comment') };
};

window.renderVoices = function renderSeparatedVoices(id, groups) {
  function section(title, rows) {
    const body = rows.length
      ? rows.map(([author, count]) => `<div class="voice-row"><span>${escapeHtml(author)}</span><strong>${fmt(count)}</strong></div>`).join('')
      : '<div class="muted tiny">None in sample</div>';
    return `<div class="voice-kind"><div class="voice-kind-title">${title}</div>${body}</div>`;
  }
  $(id).innerHTML = section('Post authors', groups.authors) + section('Commenters', groups.commenters);
};
