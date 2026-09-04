function renderStackedBars(containerId, labels, posts, comments, options = {}) {
  const container = $(containerId);
  const width = 820;
  const height = 290;
  const pad = { top: 16, right: 12, bottom: 46, left: 50 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxVal = Math.max(1, ...labels.map((l, i) => (posts[i] || 0) + (comments[i] || 0)));
  const step = innerW / Math.max(labels.length, 1);
  const barW = Math.max(6, Math.min(42, step * 0.68));

  const y = (v) => pad.top + innerH - (v / maxVal) * innerH;
  const x = (i) => pad.left + i * step + (step - barW) / 2;

  const gridLines = 4;
  let grid = '';
  for (let i = 0; i <= gridLines; i++) {
    const val = (maxVal / gridLines) * i;
    const yy = y(val);
    grid += `<line x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}" stroke="var(--line)" stroke-width="1" />`;
    grid += `<text x="${pad.left - 8}" y="${yy + 4}" text-anchor="end" fill="var(--muted)" font-size="11">${fmt(val)}</text>`;
  }

  let bars = '';
  let xLabels = '';
  const labelEvery = labels.length > 22 ? 3 : labels.length > 14 ? 2 : 1;
  labels.forEach((label, i) => {
    const p = posts[i] || 0;
    const c = comments[i] || 0;
    const pHeight = (p / maxVal) * innerH;
    const cHeight = (c / maxVal) * innerH;
    const barX = x(i);
    const pY = y(p + c);
    const cY = y(c);
    bars += `<rect x="${barX}" y="${cY}" width="${barW}" height="${cHeight}" rx="4" fill="var(--violet)"><title>${label}: ${fmt(c)} comments</title></rect>`;
    bars += `<rect x="${barX}" y="${pY}" width="${barW}" height="${pHeight}" rx="4" fill="var(--blue)"><title>${label}: ${fmt(p)} posts</title></rect>`;
    if (i % labelEvery === 0) {
      xLabels += `<text x="${barX + barW / 2}" y="${height - 14}" text-anchor="middle" fill="var(--muted)" font-size="11">${escapeHtml(label)}</text>`;
    }
  });

  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" aria-label="stacked bar chart">${grid}<line x1="${pad.left}" y1="${pad.top + innerH}" x2="${width - pad.right}" y2="${pad.top + innerH}" stroke="var(--line)" />${bars}${xLabels}</svg>`;
}

function renderLineChart(containerId, labels, values) {
  const container = $(containerId);
  const width = 820;
  const height = 290;
  const pad = { top: 16, right: 16, bottom: 46, left: 50 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxVal = Math.max(1, ...values);
  const step = labels.length > 1 ? innerW / (labels.length - 1) : innerW;
  const x = (i) => pad.left + i * step;
  const y = (v) => pad.top + innerH - (v / maxVal) * innerH;

  let grid = '';
  for (let i = 0; i <= 4; i++) {
    const val = (maxVal / 4) * i;
    const yy = y(val);
    grid += `<line x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}" stroke="var(--line)" stroke-width="1" />`;
    grid += `<text x="${pad.left - 8}" y="${yy + 4}" text-anchor="end" fill="var(--muted)" font-size="11">${fmt(val)}</text>`;
  }

  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const dots = values.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="4.5" fill="var(--indigo)"><title>${labels[i]}: ${fmt(v)} active authors</title></circle>`).join('');
  const xLabels = labels.map((label, i) => `<text x="${x(i)}" y="${height - 14}" text-anchor="middle" fill="var(--muted)" font-size="11">${escapeHtml(label)}</text>`).join('');

  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" aria-label="line chart">${grid}<polyline fill="none" stroke="var(--indigo)" stroke-width="3" points="${points}" />${dots}${xLabels}</svg>`;
}

function renderHorizontalBars(containerId, items) {
  const container = $(containerId);
  const top = items.slice(0, 10);
  const maxVal = Math.max(1, ...top.map((x) => x.total));
  const html = top.map((item, idx) => {
    const width = (item.total / maxVal) * 100;
    return `<div class="bar-row">
      <div class="bar-top"><span>${idx + 1}. <strong>${escapeHtml(item.author)}</strong></span><span>${fmt(item.total)}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${width}%; background:linear-gradient(135deg, var(--blue), var(--violet))"></div></div>
      <div class="muted" style="font-size:0.83rem">${fmt(item.posts)} posts · ${fmt(item.comments)} comments</div>
    </div>`;
  }).join('');
  container.innerHTML = `<div class="mini-bars">${html}</div>`;
}

function renderComposition(totalPosts, totalComments, distinctAuthors, returningAuthors, oneTimeAuthors) {
  const totalContrib = totalPosts + totalComments;
  const html = [
    { label: 'Posts share', value: totalPosts, total: totalContrib, detail: `${fmt(totalPosts)} of ${fmt(totalContrib)} total contributions`, color: 'linear-gradient(135deg, var(--blue), var(--indigo))' },
    { label: 'Comments share', value: totalComments, total: totalContrib, detail: `${fmt(totalComments)} of ${fmt(totalContrib)} total contributions`, color: 'linear-gradient(135deg, var(--violet), #c084fc)' },
    { label: 'Returning authors', value: returningAuthors, total: distinctAuthors, detail: `${fmt(returningAuthors)} of ${fmt(distinctAuthors)} distinct authors`, color: 'linear-gradient(135deg, var(--green), #86efac)' },
    { label: 'One-time authors', value: oneTimeAuthors, total: distinctAuthors, detail: `${fmt(oneTimeAuthors)} of ${fmt(distinctAuthors)} distinct authors`, color: 'linear-gradient(135deg, var(--amber), #fcd34d)' },
  ].map(item => `<div class="bar-row">
    <div class="bar-top"><span>${item.label}</span><span>${pct(item.value, item.total)}</span></div>
    <div class="bar-track"><div class="bar-fill" style="width:${item.total ? (item.value / item.total) * 100 : 0}%; background:${item.color}"></div></div>
    <div class="muted" style="font-size:0.83rem">${item.detail}</div>
  </div>`).join('');
  $('compositionBars').innerHTML = html;
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function periodLabel(granularity, label) {
  if (granularity === 'month') return label;
  if (granularity === 'week') return label;
  return label;
}

function buildTopAuthors(postMap, commentMap) {
  const authors = unionAuthorNames(postMap, commentMap);
  const rows = [];
  for (const author of authors) {
    const posts = postMap.get(author) || 0;
    const comments = commentMap.get(author) || 0;
    rows.push({ author, posts, comments, total: posts + comments });
  }
  rows.sort((a, b) => b.total - a.total || b.comments - a.comments || a.author.localeCompare(b.author));
  return rows;
}

function renderTopAuthorsTable(items) {
  $('topAuthorsTable').innerHTML = items.slice(0, 25).map((row, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${escapeHtml(row.author)}</td>
      <td class="num">${fmt(row.total)}</td>
      <td class="num">${fmt(row.posts)}</td>
      <td class="num">${fmt(row.comments)}</td>
    </tr>
  `).join('');
}

function renderMonthlyCards(monthLabels, postSeriesMap, commentSeriesMap, authorMonthlyMap) {
  const html = monthLabels.map((month) => {
    const posts = postSeriesMap.get(month) || 0;
    const comments = commentSeriesMap.get(month) || 0;
    const authors = authorMonthlyMap.get(month) || 0;
    return `<div class="aggregate-card">
      <div class="agg-label">${escapeHtml(month)}</div>
      <div class="agg-value">${fmt(posts + comments)}</div>
      <div class="agg-mini">${fmt(posts)} posts<br>${fmt(comments)} comments<br>${fmt(authors)} active authors</div>
    </div>`;
  }).join('');
  $('aggregateGrid').innerHTML = html;
}
