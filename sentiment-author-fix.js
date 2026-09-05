'use strict';

(function () {
  function unavailableAuthor(value) {
    const author = String(value || '').trim().toLowerCase();
    return !author || ['[unknown]', 'unknown', '[unavailable]', 'unavailable', '[deleted]', 'deleted'].includes(author);
  }

  function authorLabel(value) {
    return unavailableAuthor(value) ? 'author unavailable' : `u/${value}`;
  }

  const baseEnrich = enrich;
  enrich = function (posts, comments, linkedPosts) {
    return baseEnrich(posts, comments, linkedPosts).map(item =>
      unavailableAuthor(item.author) ? { ...item, author: '' } : item
    );
  };

  topVoices = function (items, label, kind) {
    const counts = new Map();
    items
      .filter(item => item.label === label && item.kind === kind && !unavailableAuthor(item.author))
      .forEach(item => counts.set(item.author, (counts.get(item.author) || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  };

  renderPopular = function (posts) {
    $('popularPosts').innerHTML = posts.length ? posts.map(post => {
      const href = redditUrl(post);
      const title = escapeHtml(post.title || '(untitled)');
      const who = escapeHtml(authorLabel(post.author));
      return `<div class="post-item"><div class="post-title">${href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${title}</a>` : title}</div><div class="post-meta">score ${fmt(post.score || 0)} · ${fmt(post.num_comments || 0)} comments · ${who}</div></div>`;
    }).join('') : '<span class="muted">No linked post data.</span>';
  };

  renderEvidence = function (items) {
    const groups = ['positive', 'neutral', 'negative'];
    $('evidenceGrid').innerHTML = groups.map(label => {
      const rows = representative(items, label);
      return `<div class="evidence-card"><strong class="${label}-text">${label[0].toUpperCase() + label.slice(1)}</strong>${rows.map(item => `<p>“${escapeHtml(excerpt(itemText(item), 180))}”</p><div class="evidence-meta">${escapeHtml(authorLabel(item.author))} · ${item.kind} · post score ${fmt(item.postScore)} · ${sourceLabel(item)}</div>`).join('')}</div>`;
    }).join('');
  };

  const baseRenderCoverage = renderCoverage;
  renderCoverage = function (data) {
    baseRenderCoverage(data);
    const stats = data.stats || {};
    const notes = [];
    const shownComments = Array.isArray(data.comments) ? data.comments.length : Number(stats.mergedComments || 0);
    const contextual = Number(stats.archiveThreadComments || 0);
    if (contextual > shownComments) {
      notes.push(`${fmt(contextual)} archived comments were found under matched topic posts; ${fmt(shownComments)} are shown because of the selected Max per type limit.`);
    }
    const unresolved = Number(stats.unresolvedPostAuthors || 0) + Number(stats.unresolvedCommentAuthors || 0);
    if (unresolved) {
      notes.push(`${fmt(unresolved)} contribution author${unresolved === 1 ? '' : 's'} could not be resolved after archive lookup and ${unresolved === 1 ? 'is' : 'are'} excluded from voice counts.`);
    }
    if (notes.length) $('coverageNote').insertAdjacentHTML('beforeend', `<br><span class="muted tiny">${notes.map(escapeHtml).join(' ')}</span>`);
  };
})();
