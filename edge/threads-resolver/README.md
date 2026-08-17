# Threads share-alias resolver

Threads for Android may share an intermediate URL such as `https://www.threads.com/share/<token>/` instead of the canonical `https://www.threads.com/@user/post/<id>` permalink.

The production PWA automatically calls the project-owned resolver at:

```text
https://resolver.mythic3011.com/v1/threads/resolve
```

A static GitHub Pages PWA cannot inspect a cross-origin redirect target because Fetch/CORS hides cross-origin redirect details. This Cloudflare Worker resolves only strict Threads `/share/` aliases and returns only a validated Threads post permalink.

Security properties:

- accepts only HTTPS Threads hosts and `/share/<token>` paths;
- follows redirects manually and validates every redirect hop;
- never forwards browser cookies or Threads credentials;
- reads at most 256 KiB of upstream HTML when redirect resolution alone is insufficient;
- CORS is restricted to `https://share-tools.mythic3011.com`;
- no generic URL-fetch/proxy behavior;
- no request-body or alias logging in application code.

## Deploy

Set repository Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, then run the **Deploy Threads Resolver** workflow. The Worker config attaches the custom domain `resolver.mythic3011.com`.

Local/manual deployment is also possible:

```bash
cd edge/threads-resolver
npx wrangler deploy
```

Health check:

```bash
curl https://resolver.mythic3011.com/healthz
```

The PWA retains a safe fallback if the resolver is temporarily unavailable, but the production deployment should treat resolver health as part of release readiness.
