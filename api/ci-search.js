const search = require('./search');

const ISSUER = 'https://token.actions.githubusercontent.com';
const AUDIENCE = 'distinct-authors-ci';
const REPOSITORY = 'jenschristianschroder/Distinct-Authors';
const OWNER = 'jenschristianschroder';
let remoteJwks;

function bearerToken(req) {
  const value = String(req.headers?.authorization || '');
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

async function verifyGitHubActionsToken(token) {
  if (!token) throw new Error('Missing bearer token.');
  const { createRemoteJWKSet, jwtVerify } = await import('jose');
  if (!remoteJwks) remoteJwks = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks`));
  const { payload } = await jwtVerify(token, remoteJwks, {
    issuer: ISSUER,
    audience: AUDIENCE,
    clockTolerance: 10
  });
  if (payload.repository !== REPOSITORY) throw new Error('Unexpected repository claim.');
  if (payload.repository_owner !== OWNER) throw new Error('Unexpected repository owner claim.');
  if (payload.ref !== 'refs/heads/main') throw new Error('CI probe is restricted to main.');
  if (!['push', 'workflow_dispatch'].includes(String(payload.event_name || ''))) {
    throw new Error('Unexpected GitHub Actions event.');
  }
  return payload;
}

module.exports = async function ciSearch(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  try {
    await verifyGitHubActionsToken(bearerToken(req));
  } catch (error) {
    return res.status(401).json({ error: `GitHub Actions OIDC verification failed: ${error.message}` });
  }

  const appToken = process.env.APP_ACCESS_TOKEN;
  if (!appToken) return res.status(503).json({ error: 'APP_ACCESS_TOKEN is not configured on Vercel.' });

  const fakeReq = {
    method: 'POST',
    headers: { 'x-app-token': appToken },
    body: {
      subreddit: 'TheTowerGame',
      topic: 'Daily gem cap',
      start: '2026-08-20',
      end: '2026-09-05',
      depth: 'standard',
      maxItems: 100
    }
  };

  return search(fakeReq, res);
};
