import crypto from 'node:crypto';

const DEFAULT_MODEL = 'gpt-5.6-luna';
const DEFAULT_ALLOWED_ORIGINS = [
  'https://jenschristianschroder.github.io',
];

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function allowedOrigins() {
  const configured = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins().has(origin)) return true;
  try {
    const u = new URL(origin);
    if (u.protocol === 'https:' && u.hostname.endsWith('.vercel.app')) return true;
    if (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)) return true;
  } catch {}
  return false;
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-App-Token');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text.trim();
  const parts = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('\n').trim();
}

function clean(value, max) {
  return String(value || '').replace(/\u0000/g, '').trim().slice(0, max);
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  if (!isAllowedOrigin(req.headers.origin)) return res.status(403).json({ error: 'Origin not allowed.' });

  const expectedToken = process.env.APP_ACCESS_TOKEN;
  const suppliedToken = req.headers['x-app-token'];
  if (!expectedToken) return res.status(503).json({ error: 'Backend access token is not configured.' });
  if (!safeEqual(suppliedToken, expectedToken)) return res.status(401).json({ error: 'Invalid backend access token.' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'OPENAI_API_KEY is not configured on Vercel.' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const subreddit = clean(body.subreddit, 100);
  const topic = clean(body.topic, 240);
  const evidence = clean(body.evidence, 18000);
  const start = clean(body?.dateRange?.start, 20);
  const end = clean(body?.dateRange?.end, 20);
  const popularity = Array.isArray(body.popularityGroups) ? body.popularityGroups.slice(0, 8) : [];

  if (!subreddit || !topic || !evidence) {
    return res.status(400).json({ error: 'subreddit, topic, and evidence are required.' });
  }

  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const instructions = [
    'You summarize sampled Reddit discussion accurately and conservatively.',
    'Use only the supplied evidence. Do not invent facts or treat the sample as representative of all subreddit users.',
    'Separate recurring opinions from isolated remarks. Note disagreement and uncertainty.',
    'Do not infer demographics, identity, private traits, or motivations of authors.',
    'Write a concise report with these headings: Overall read, Main opinions, Disagreements, Popular-post pattern, Caveats.',
    'Under Main opinions, give 3 to 6 bullets and label each as positive, neutral, mixed, or negative.',
  ].join(' ');

  const input = [
    `Topic: ${topic}`,
    `Subreddit: r/${subreddit}`,
    start && end ? `Date range: ${start} to ${end}` : '',
    popularity.length ? `Popularity groups: ${JSON.stringify(popularity)}` : '',
    '',
    'Evidence:',
    evidence,
  ].filter(Boolean).join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        instructions,
        input,
        max_output_tokens: 1100,
      }),
    });

    const payload = await openaiResponse.json().catch(() => ({}));
    if (!openaiResponse.ok) {
      const message = payload?.error?.message || `OpenAI API returned HTTP ${openaiResponse.status}.`;
      return res.status(openaiResponse.status >= 500 ? 502 : 400).json({ error: message });
    }

    const summary = extractOutputText(payload);
    if (!summary) return res.status(502).json({ error: 'OpenAI returned no text.' });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ summary, model });
  } catch (error) {
    if (error?.name === 'AbortError') return res.status(504).json({ error: 'OpenAI request timed out.' });
    return res.status(500).json({ error: 'Unable to generate the AI summary.' });
  } finally {
    clearTimeout(timer);
  }
}
