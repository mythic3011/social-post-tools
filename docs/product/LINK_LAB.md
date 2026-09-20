# Link Lab

Link Lab is the local link-inspection workspace at `/link-lab.html`. It makes the provider capability model visible instead of hiding every choice behind a single generic “alternative link” setting.

## Outputs

For a canonical X or Threads post, Link Lab separates three concepts:

1. **Clean** — the canonical source permalink with tracking noise removed.
2. **Preview** — an active `embed` provider intended for chat/link previews.
3. **Reader** — an active `reader` provider intended for alternate reading.

The current built-in behavior is:

| Platform | Clean | Preview | Reader |
| --- | --- | --- | --- |
| X | `x.com` canonical URL | FixupX by default; FixVX is selectable | XCancel |
| Threads | `threads.com` canonical URL | vxThreads | none currently |

The provider dropdowns are populated from the shared `SocialPostCore` registry. Retired providers therefore remain migration-readable without becoming normal Link Lab choices.

Changing a provider in Link Lab changes only the current comparison. It does not overwrite the global PWA provider settings.

## Network and privacy boundary

Link Lab deliberately has `connect-src 'none'` and performs no provider health probes. Pasting or deep-linking a post URL does not cause background requests to FixupX, FixVX, XCancel, vxThreads, or the Threads resolver.

Only explicit **Open** actions navigate to an output provider.

The page also uses `referrer=no-referrer`, so opening an external output does not send the Link Lab page URL as a referrer.

## Privacy-preserving deep links

A caller can open Link Lab with a post URL in the URL fragment:

```text
https://share-tools.mythic3011.com/link-lab.html#url=https%3A%2F%2Fx.com%2Fexample%2Fstatus%2F123
```

The fragment is not part of the HTTP request sent to the hosting server. Link Lab reads the `url` fragment value locally, clears the fragment with `history.replaceState`, and then runs the same local analysis used for pasted input.

Do not replace this design with a `?url=` query parameter. A query parameter would be visible to the hosting request path and could leak the inspected social URL into server/CDN logs.

## Threads share aliases

A native Threads share can contain a URL such as:

```text
https://www.threads.com/share/<token>
```

Link Lab recognizes this as a Threads share alias, but it does **not** resolve it because the page is intentionally network-silent. It displays the normalized alias and marks Preview/Reader as pending/unavailable.

Canonical alias resolution remains part of the normal Android Share Target pipeline, where the constrained project-owned resolver is an explicit, bounded enrichment stage.

## Testing

`tests/link_lab_audit.py` protects the static privacy and registry boundaries, including:

- no network-probe APIs;
- `connect-src 'none'`;
- no `innerHTML`, `eval`, or `new Function`;
- read-only access to global PWA settings;
- shared provider-registry usage;
- fragment-only deep-link input;
- fragment clearing after consumption.

`tests/link_lab_browser.py` runs the built page in Chromium and verifies canonicalization, provider selection/switching, reader availability, Threads alias behavior, and mobile layout.