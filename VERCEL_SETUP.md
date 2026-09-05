# Vercel setup for hybrid Reddit AI search

The sentiment page remains a static frontend, while Reddit web search, best-effort Reddit thread retrieval, Arctic Shift backfill, and OpenAI summarization run through Vercel Functions. The OpenAI API key never reaches the browser.

## 1. Import this GitHub repository into Vercel

Create a Vercel project from `jenschristianschroder/Distinct-Authors` using the `main` branch. The repository does not need a framework preset; Vercel serves the static files and functions under `api/`.

## 2. Add environment variables

In **Vercel project → Settings → Environment Variables**, add these for Production (and Preview if you want preview deployments to work):

- `OPENAI_API_KEY` — your OpenAI project API key. Mark it Sensitive.
- `APP_ACCESS_TOKEN` — a long custom value you choose. This is the token entered in the sentiment page. Mark it Sensitive.
- `OPENAI_MODEL` — optional. Defaults to `gpt-5.6-luna`.
- `ALLOWED_ORIGINS` — optional comma-separated browser origins. The default includes `https://jenschristianschroder.github.io`; Vercel-hosted deployments are also accepted.

Never commit either secret to GitHub.

## 3. Redeploy

Environment-variable changes apply to new deployments. Redeploy after changing the variables.

## 4. Connect the sentiment page

The hybrid search endpoint is:

`https://distinct-authors.vercel.app/api/search`

If you use the Vercel-hosted page itself, `/api/search` also works.

Enter the same custom `APP_ACCESS_TOKEN` value in the page. The page remembers the backend URL locally and keeps the access token only in the current browser tab.

## How hybrid retrieval works

1. OpenAI generates high-precision topic variants.
2. GPT-5.6 Luna runs Reddit-only web searches from multiple lexical and semantic angles.
3. The backend extracts discovered Reddit post/comment URLs and tries to fetch those Reddit threads directly.
4. Arctic Shift searches the same date range with the AI-generated terms to backfill archive coverage.
5. Results are deduplicated, linked post popularity is added, and OpenAI summarizes the combined sample.

The default **Thorough** mode performs two AI web-search passes and a broader Arctic Shift backfill. **Standard** mode is faster and cheaper.

## Coverage caveat

This approach is designed to reduce missed discussion, especially for recent dates, but it is not guaranteed to be exhaustive. Search-engine indexing, Reddit access/rate limits, deleted content, and Arctic Shift archive lag can all leave gaps. The page shows retrieval statistics and warnings after each run.

## Security notes

- `OPENAI_API_KEY` exists only as a Vercel server-side environment variable.
- `APP_ACCESS_TOKEN` is not an OpenAI key. It is a gate in front of the functions to reduce casual unauthorized use.
- Requests validate browser origin and the app access token.
- Keep an OpenAI project budget/usage alert configured as a second layer of protection.