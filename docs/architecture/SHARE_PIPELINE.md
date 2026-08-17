# Share parsing pipeline

Social Post Tools uses a small staged pipeline for Android Web Share payloads and other incoming social links.

The model is **inspired by CrowdSec's log-processing architecture**, not compatible with CrowdSec and not intended to copy its security semantics. CrowdSec separates acquisition, staged parsers (`s00-raw`, `s01-parse`, `s02-enrich`), and higher-level processing; collections bundle the pieces needed for a service. That separation is useful here because Android share payloads are similarly inconsistent across apps and browsers.

References:

- CrowdSec Log Processor: https://docs.crowdsec.net/docs/next/log_processor/intro/
- CrowdSec parser stages: https://docs.crowdsec.net/docs/next/log_processor/parsers/intro/
- CrowdSec collections: https://docs.crowdsec.net/docs/log_processor/collections/intro/

## Pipeline

```text
Acquisition
  Android Web Share Target / pasted URL / browser DOM
        |
        v
s00-raw
  normalize title/text/url
  extract every HTTP(S) candidate
  assign stable URL identities
  deduplicate repeated URLs
        |
        v
s01-parse
  parser registry
  |- x-post
  |- threads-post
  `- threads-share-alias
        |
        v
s02-enrich
  static opt-in enrichers
  `- threads-share-resolver
        |
        v
Normalized ShareEvent
  canonical URL + clean text + provenance
        |
        v
Actions / destinations
  copy / Web Share / Telegram / alternate frontend / AI capture
```

## `s00-raw`: normalize once

Android apps commonly send the same URL in both `url` and `text`, and some send the URL more than once inside `text`. Normalization happens before any platform parser runs so every parser sees the same predictable envelope.

For example:

```text
url  = https://www.threads.com/@alice/post/ABC?xmt=1
text = https://www.threads.com/@alice/post/ABC?xmt=1 https://www.threads.com/@alice/post/ABC?xmt=1
```

becomes:

```text
canonicalUrl = https://www.threads.com/@alice/post/ABC
text         = ""
```

The URL is not duplicated into the Web Share `text` field when it is already supplied as the Web Share `url` field.

## `s01-parse`: parser registry

Parsers are statically registered objects with an ID, stage, priority, and parse function. Higher-quality identifiers win over weaker aliases. A canonical Threads post therefore wins over a `/share/<opaque-id>` alias if both appear in the same payload.

Current parsers:

| Parser | Input | Result |
| --- | --- | --- |
| `x-post` | X/Twitter status permalink | canonical X post |
| `threads-post` | Threads post permalink | canonical Threads post |
| `threads-share-alias` | Threads `/share/<id>` | unresolved Threads alias |

The selected parser is recorded in non-sensitive pipeline metadata so tests and diagnostics can explain *why* a payload was classified a certain way.

## `s02-enrich`: constrained plugins

Enrichers add information that cannot be derived locally. They are static, source-controlled plugins; Social Post Tools does **not** download or execute remote JavaScript plugins.

The current `threads-share-resolver` can replace a Threads `/share/<id>` alias with a canonical post permalink. It is optional, HTTPS-only, credentialless, and constrained to the configured resolver endpoint.

## Collections as a design concept

CrowdSec collections bundle the pieces needed for a service. Social Post Tools uses the same idea conceptually:

```text
X collection
  x-post parser
  X DOM extractor
  Nitter/embed builders
  AI/archive actions

Threads collection
  threads-post parser
  threads-share-alias parser
  optional alias resolver
  Threads DOM extractor
  vxThreads builder
  AI/archive actions
```

These are compiled into the application rather than dynamically installed. `SHARE_COLLECTIONS` records the parser/enricher/capability membership used for diagnostics and future organization, while `SHARE_PARSERS` and the PWA's enricher registry contain the executable implementations. Keeping them static reduces supply-chain and runtime complexity.

This mirrors CrowdSec's useful organizational distinction — staged parsers plus collections that group service-specific content — without importing CrowdSec's detection/scenario semantics into a URL-normalization tool.

## Android AI capture handoff

Android App Links can send an ordinary `https://threads.com/...` navigation back to the native Threads app. Rich capture needs the browser that actually has the Userscript.

The handoff therefore uses a two-step browser bridge:

```text
Chrome-installed PWA
  -> explicit Android intent to Firefox
  -> share-tools capture-handoff.html
  -> Social Post Tools Userscript runs on the bridge
  -> GM_openInTab(post#sptCapture=...)
  -> X/Threads page stays inside the Userscript browser
```

Firefox is the default Android capture browser because userscript managers such as Tampermonkey are available there. The setting is configurable for Firefox Beta/Nightly or the system browser.

The bridge carries only the post URL and capture mode. It never carries extracted post text, media binaries, comments, credentials, or archive data.

## Plugin rules

1. Plugins are registered in source; no `eval`, remote module loader, or arbitrary plugin URL.
2. A parser must be pure and synchronous.
3. Network enrichment is a separate stage and must be explicit in CSP and permissions.
4. Each plugin must declare a narrow match condition.
5. A failed enricher returns the last valid normalized event rather than fabricating a result.
6. Destinations consume the normalized event instead of reparsing Android payloads themselves.
