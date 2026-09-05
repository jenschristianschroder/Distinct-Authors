'use strict';

(() => {
  const oldButton = document.getElementById('llmButton');
  if (!oldButton) return;

  // sentiment.js attaches a direct provider handler. Cloning removes that listener
  // so the production page always routes AI calls through the Vercel backend.
  const button = oldButton.cloneNode(true);
  oldButton.replaceWith(button);

  const backendInput = document.getElementById('llmBackend');
  const tokenInput = document.getElementById('appToken');

  if (backendInput) {
    try {
      const saved = localStorage.getItem('sentimentBackendUrl');
      if (saved) backendInput.value = saved;
      else if (location.hostname.endsWith('.vercel.app')) backendInput.value = location.origin;
    } catch {}

    backendInput.addEventListener('change', () => {
      const value = backendInput.value.trim().replace(/\/$/, '');
      try {
        if (value) localStorage.setItem('sentimentBackendUrl', value);
        else localStorage.removeItem('sentimentBackendUrl');
      } catch {}
    });
  }

  function endpointFrom(value) {
    const base = String(value || '').trim().replace(/\/$/, '');
    if (!base) return '';
    return base.endsWith('/api/summarize') ? base : `${base}/api/summarize`;
  }

  function getAnalysis() {
    try {
      return typeof currentAnalysis === 'undefined' ? null : currentAnalysis;
    } catch {
      return null;
    }
  }

  async function summarizeWithBackend() {
    const analysis = getAnalysis();
    if (!analysis) return showError('Run a topic analysis first.');

    const endpoint = endpointFrom(backendInput?.value);
    const appToken = tokenInput?.value.trim();
    if (!endpoint || !appToken) return showError('Enter the Vercel backend URL and app access token.');

    button.disabled = true;
    button.textContent = 'Summarizing…';
    document.getElementById('error')?.classList.add('hidden');

    try {
      const evidence = buildLlmEvidence(analysis.items, analysis.phrases);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-App-Token': appToken
        },
        body: JSON.stringify({
          topic: analysis.topic,
          subreddit: analysis.subreddit,
          dateRange: { start: analysis.start, end: analysis.end },
          popularityGroups: analysis.popGroups || [],
          evidence
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || `Backend HTTP ${response.status}`);
      if (!payload?.summary) throw new Error('Backend returned no summary text.');

      const summary = document.getElementById('llmSummary');
      const card = document.getElementById('llmSummaryCard');
      summary.textContent = payload.summary;
      card.classList.remove('hidden');

      const subtitle = card.querySelector('.chart-sub');
      if (subtitle) {
        const usage = Number(payload?.usage?.total_tokens || 0);
        subtitle.textContent = `Themes synthesized from representative excerpts in the current sample${payload.model ? ` · ${payload.model}` : ''}${usage ? ` · ${usage.toLocaleString()} tokens` : ''}.`;
      }
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      showError(`AI summary failed: ${error.message || error}`);
    } finally {
      button.disabled = false;
      button.textContent = 'Summarize opinions with OpenAI';
    }
  }

  button.addEventListener('click', summarizeWithBackend);
})();
