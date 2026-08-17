# Threads `/share/` alias resolution

The Android Threads app can send a short `/share/<token>` URL. That URL is an intermediate alias, not the clean post permalink, so Social Post Tools must not treat it as the final share URL.

## Desired flow

```text
Threads Android share
→ https://www.threads.com/share/<token>/
→ Social Post Tools resolver
→ https://www.threads.com/@user/post/<id>
→ canonicalize / strip query + tracking
→ selected vxThreads or clean-link action
```

The PWA first tries the optional edge resolver. If resolution succeeds, every normal action uses the canonical post permalink. The `/share/` alias is retained only as provenance (`resolvedFrom`) in memory. If the resolver is absent or fails, the UI falls back to opening/copying the Threads alias rather than inventing a canonical URL.

The edge component is intentionally narrow and is not a generic open proxy. See `edge/threads-resolver/README.md`.
