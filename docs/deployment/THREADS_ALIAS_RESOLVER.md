# Threads alias resolver

Threads Android can share an opaque URL such as `https://www.threads.com/share/<token>/`. That token is not the post ID, so the static PWA cannot safely rewrite it into `@user/post/<id>` without following Threads server-side.

For the production site, `build.py --pages-base https://share-tools.mythic3011.com` automatically configures:

`https://resolver.mythic3011.com/v1/threads/resolve`

No `THREADS_RESOLVER_URL` GitHub variable is required.

## One-time Cloudflare setup

Create repository Actions secrets:

- `CLOUDFLARE_API_TOKEN` — token allowed to deploy Workers and manage the Worker custom domain.
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID.

Then run **Deploy Threads Resolver** in GitHub Actions. Future changes under `edge/threads-resolver/` deploy automatically.

The Worker uses the custom domain `resolver.mythic3011.com`, restricts browser CORS to `https://share-tools.mythic3011.com`, accepts only HTTPS Threads `/share/<token>` inputs, validates every redirect hop, and is not a generic proxy.

Health check:

```bash
curl https://resolver.mythic3011.com/healthz
```

Expected:

```json
{"ok":true,"service":"social-post-tools-threads-resolver"}
```

Forks and local builds do not inherit the mythic3011 resolver unless they deliberately use the production Pages URL. Override with `--threads-resolver-url`, or disable with `--no-threads-resolver`.
