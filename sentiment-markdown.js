'use strict';

(function () {
  const target = document.getElementById('llmSummary');
  if (!target) return;

  function appendInline(parent, text) {
    const source = String(text || '');
    const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
    let index = 0;
    let match;
    while ((match = pattern.exec(source))) {
      if (match.index > index) parent.append(document.createTextNode(source.slice(index, match.index)));
      const token = match[0];
      let node;
      if (token.startsWith('**')) {
        node = document.createElement('strong');
        node.textContent = token.slice(2, -2);
      } else if (token.startsWith('`')) {
        node = document.createElement('code');
        node.textContent = token.slice(1, -1);
      } else {
        node = document.createElement('em');
        node.textContent = token.slice(1, -1);
      }
      parent.append(node);
      index = match.index + token.length;
    }
    if (index < source.length) parent.append(document.createTextNode(source.slice(index)));
  }

  function renderMarkdown(source) {
    const fragment = document.createDocumentFragment();
    const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
    let paragraph = [];
    let list = null;
    let listType = '';

    function flushParagraph() {
      if (!paragraph.length) return;
      const p = document.createElement('p');
      appendInline(p, paragraph.join(' ').trim());
      fragment.append(p);
      paragraph = [];
    }

    function flushList() {
      if (!list) return;
      fragment.append(list);
      list = null;
      listType = '';
    }

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) {
        flushParagraph();
        flushList();
        continue;
      }

      const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        flushParagraph();
        flushList();
        const h = document.createElement(heading[1].length <= 2 ? 'h4' : 'h5');
        appendInline(h, heading[2]);
        fragment.append(h);
        continue;
      }

      const unordered = trimmed.match(/^[-*]\s+(.+)$/);
      const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
      if (unordered || ordered) {
        flushParagraph();
        const type = unordered ? 'ul' : 'ol';
        if (!list || listType !== type) {
          flushList();
          list = document.createElement(type);
          listType = type;
        }
        const li = document.createElement('li');
        appendInline(li, (unordered || ordered)[1]);
        list.append(li);
        continue;
      }

      flushList();
      paragraph.push(trimmed);
    }

    flushParagraph();
    flushList();
    return fragment;
  }

  function renderCurrentText() {
    if (target.childNodes.length !== 1 || target.firstChild.nodeType !== Node.TEXT_NODE) return;
    const source = target.textContent || '';
    if (!source.trim()) return;
    target.replaceChildren(renderMarkdown(source));
  }

  const observer = new MutationObserver(() => queueMicrotask(renderCurrentText));
  observer.observe(target, { childList: true, characterData: true, subtree: true });
  renderCurrentText();
})();
