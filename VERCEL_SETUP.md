# Vercel setup for OpenAI summaries

The sentiment page stays static, but AI summaries are routed through a Vercel Function so the OpenAI API key never reaches the browser.

## 1. Import this GitHub repository into Vercel

Create a Vercel project from `jenschristianschroder/Distinct-Authors` using the `main` branch. The repository does not need a framework preset; Vercel can serve the static files and the function under `api/`.

## 2. Add environment variables

In **Vercel project → Settings → Environment Variables**, add these for Production (and Preview if you want to test preview deployments):

- `OPENAI_API_KEY` — your OpenAI project API key. Mark it Sensitive.
- `APP_ACCESS_TOKEN` — a long custom value you choose. This is the token entered in the sentiment page. Mark it Sensitive.
- `OPENAI_MODEL` — optional. Defaults to `gpt-5-nano`.
- `ALLOWED_ORIGINS` — optional comma-separated browser origins. Default includes `https://jenschristianschroder.github.io` and Vercel-hosted deployments are also accepted.

Never commit either secret to GitHub.

## 3. Redeploy

Environment-variable changes apply to new deployments. Redeploy the project after saving the variables.

## 4. Connect the sentiment page

If you use the Vercel-hosted page, the backend URL can be `/api/summarize`.

If you keep using GitHub Pages, enter the full endpoint shown by your Vercel deployment, for example:

`https://your-project.vercel.app/api/summarize`

Then enter the same custom `APP_ACCESS_TOKEN` value. The page remembers the backend URL locally and keeps the access token only in the current tab session.

## Security notes

- `OPENAI_API_KEY` exists only as a Vercel server-side environment variable.
- `APP_ACCESS_TOKEN` is not an OpenAI key. It is a gate in front of the function to reduce casual unauthorized use.
- The endpoint validates origin, request size, the access token, and fixes the model server-side so a browser cannot choose an arbitrary expensive model.
- Keep an OpenAI project budget/usage alert configured as a second layer of protection.
