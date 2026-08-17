# Parser, enricher, and collection model

Social Post Tools uses a **static plugin model** for incoming social-share data. The terminology is intentionally similar to CrowdSec's staged log processor because the same separation is useful: normalize raw input once, select a service-specific parser, enrich only when needed, then hand a normalized event to downstream actions.

This is an architectural reference only. Social Post Tools does not load CrowdSec content and is not compatible with CrowdSec parsers, scenarios, expressions, or Hub packages.

Official CrowdSec references:

- Parser stages: https://docs.crowdsec.net/docs/log_processor/parsers/intro/
- Log processor / collections: https://docs.crowdsec.net/docs/log_processor/intro
- Collections: https://docs.crowdsec.net/docs/log_processor/collections/intro/

## Item types

```text
Acquisition adapter
  Web Share envelope / pasted URL / browser DOM

Parser
  pure synchronous classifier + extractor

Enricher
  optional additional context; may be async/networked

Collection
  static metadata grouping the items/capabilities for one platform

Destination
  copy / Web Share / Telegram / alternate URL / AI handoff
```

## Contracts

### Parser

A parser receives one normalized URL candidate and either returns `null` or a partial normalized share event.

```js
{
  id: 'threads-post',
  stage: 's01-parse',
  priority: 200,
  parse(candidate) { ... }
}
```

Rules:

1. Pure and synchronous.
2. No DOM access.
3. No network access.
4. Must not fabricate canonical identifiers.
5. Higher-confidence parsers use higher priority.

### Enricher

An enricher receives an already parsed event and can add context that local parsing cannot safely derive.

```js
{
  id: 'threads-share-resolver',
  kind: 'enricher',
  priority: 100,
  matches(event) { ... },
  async run(event) { ... }
}
```

Rules:

1. Narrow match predicate.
2. Network origin must be explicit in CSP/configuration.
3. Credentialless by default.
4. Validate the enriched output with the shared core before committing it.
5. Failure returns the last valid event instead of inventing data.

### Collection

Collections are static metadata that document which parsers/enrichers and capabilities belong to a platform.

```text
x
  parsers: x-post
  capabilities: clean-link, alternate-link, ai-capture, archive

threads
  parsers: threads-post, threads-share-alias
  enrichers: threads-share-resolver
  capabilities: clean-link, alternate-link, ai-capture, archive
```

Collections are **not dynamically installable packages**. This avoids turning a small browser tool into a remote-code/plugin supply chain.

## Pipeline observability

Every parsed share carries compact provenance:

```json
{
  "pipeline": {
    "schema": "social-share-pipeline/v1",
    "parser": "threads-post",
    "stages": [
      {"id":"s00-raw","candidateCount":1},
      {"id":"s01-parse","parser":"threads-post"},
      {"id":"s02-enrich","status":"local"}
    ]
  }
}
```

This is similar in spirit to CrowdSec's `cscli explain`: the goal is to make classification/debugging inspectable without coupling UI actions to platform-specific parsing code.

## Destination boundary

Destinations never reparse the raw Android envelope. They consume the normalized event. Before `navigator.share`, the renderer performs one final URL/text deduplication pass because some Android source apps repeat the same permalink in multiple fields and custom templates can reintroduce it.

## AI browser broker

The AI handoff is an adapter rather than a parser/enricher. On Android, the Chrome-installed PWA targets a same-origin bridge in the configured Userscript browser. The Userscript then uses `GM_openInTab` to open the actual social post as a browser tab. This keeps Android App Links from routing the post back into the native Threads/X application before DOM capture can run.
