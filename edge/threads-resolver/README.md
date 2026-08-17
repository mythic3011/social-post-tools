# Threads share-alias resolver

Threads for Android may share an intermediate URL such as `https://www.threads.com/share/<token>/` instead of the canonical `https://www.threads.com/@user/post/<id>` permalink.

A static GitHub Pages PWA cannot inspect a cross-origin redirect target because browser Fetch/CORS intentionally hides cross-origin redirect details. This optional Cloudflare Worker resolves only strict Threads `/share/` aliases and returns only a validated Threads post permalink.

Security properties:

- accepts only HTTPS Threads hosts and `/share/<token>` paths;
- follows redirects manually and validates every redirect hop before fetching it;
- never forwards browser cookies or Threads credentials;
- reads at most 256 KiB of an upstream HTML page when redirect resolution alone is insufficient;
- CORS is restricted to `ALLOWED_ORIGIN`;
- no generic URL-fetch/proxy behavior;
- no request-body or alias logging in application code.

Deploy with Wrangler, then point the Pages build at the endpoint:

```bash
cd edge/threads-resolver
npx wrangler deploy
```

Set the GitHub repository variable to the deployed endpoint:

```bash
gh variable set THREADS_RESOLVER_URL \
  --body 'https://YOUR-WORKER.example/v1/threads/resolve'
```

Then rerun the Pages workflow. The PWA keeps a local fallback if the resolver is not configured or cannot resolve a link.
