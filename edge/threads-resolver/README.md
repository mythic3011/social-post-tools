# Threads share-alias resolver

Threads for Android may share an intermediate URL such as `https://www.threads.com/share/<token>/` instead of the canonical `https://www.threads.com/@user/post/<id>` permalink.

The production PWA calls the project-owned resolver at:

```text
https://resolver.mythic3011.com/v1/threads/resolve
```

A static GitHub Pages PWA cannot safely inspect a cross-origin redirect chain. This Cloudflare Worker resolves only strict Threads `/share/` aliases and returns only a validated Threads post permalink. It is intentionally not a generic proxy.

## Runtime policy

The resolver now treats every upstream operation as bounded work:

- accepts only HTTPS Threads hosts and `/share/<token>` paths;
- validates every manual redirect hop and never follows a redirect outside the Threads host allowlist;
- applies a 7-second upstream deadline, including bounded HTML-prefix consumption;
- reads at most 256 KiB of upstream HTML and rejects explicit non-HTML responses;
- accepts only JSON POST bodies and caps request payloads at 4 KiB;
- never forwards browser cookies, authorization, or Threads credentials;
- caches successful alias-to-canonical mappings internally for six hours to reduce repeated upstream traffic;
- does not cache failed resolutions;
- maps client, validation, upstream, timeout, and unresolved failures to distinct HTTP status classes;
- restricts browser CORS to `https://share-tools.mythic3011.com`;
- keeps the public response `Cache-Control: no-store` even when an internal Worker cache hit is used;
- contains no generic URL-fetch endpoint and no request-body or alias application logging.

The Worker exposes `GET /healthz` for deployment readiness checks.

## Tests

`tests/threads_resolver.test.mjs` injects the upstream `fetch` implementation instead of monkey-patching the runtime global. It covers redirect validation, metadata fallback, MIME rejection, upstream deadlines, body/content-type limits, cache hits, CORS, and handler status mapping.

```bash
node tests/threads_resolver.test.mjs
```

## Deploy

`.github/workflows/edge-resolver.yml` validates resolver changes on pull requests and deploys only from `main`. Deployment uses an immutable-SHA-pinned `cloudflare/wrangler-action` with an exact Wrangler version.

Required repository Actions secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The Worker config attaches the custom domain `resolver.mythic3011.com`. A successful deployment is followed by an HTTPS health check.

Local/manual deployment remains possible if you intentionally install Wrangler yourself:

```bash
cd edge/threads-resolver
npx wrangler deploy
```

Health check:

```bash
curl https://resolver.mythic3011.com/healthz
```
