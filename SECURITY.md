# Security

The detailed threat boundaries, storage rules, media-fetch policy, archive integrity model, UI dependency policy, and GitHub Pages deployment assumptions live in [`docs/architecture/SECURITY_MODEL.md`](docs/architecture/SECURITY_MODEL.md).

## Browser installation and distribution

Use the official Userscript-manager sites linked by this project:

- [Tampermonkey](https://www.tampermonkey.net/)
- [Violentmonkey](https://violentmonkey.github.io/)

Social Post Tools does not redistribute those browser extensions. `share-tools.mythic3011.com/install.html` is the human-facing installation guide, but public Userscript update metadata points at the project-generated Raw GitHub `dist` branch. jsDelivr is a fallback mirror and is pinned to an immutable `dist-v<version>` tag rather than used as the authoritative update channel.

A distribution version is published only after the full regression suite passes. The publishing workflow:

1. builds and tests with a read-only GitHub token;
2. creates `SHA256SUMS.txt` and `release.json`;
3. hands the tested files to a separate privileged job through GitHub Artifacts;
4. re-checks the SHA-256 manifest after download;
5. creates a GitHub/Sigstore Artifact Attestation for the checksummed files; and
6. publishes the generated `dist` branch plus an immutable `dist-v<version>` tag.

The build/test job does **not** receive repository-write, OIDC, or attestation permissions. Those permissions exist only in the short publish job after the tested artifact handoff.

A downloaded Userscript can be checked against its published checksum and GitHub provenance:

```bash
sha256sum --check SHA256SUMS.txt
gh attestation verify social-post-tools.user.js -R mythic3011/social-post-tools
```

A matching SHA-256 digest proves byte equality with the published manifest. A valid GitHub Artifact Attestation additionally ties that artifact digest to the GitHub Actions workflow identity that produced it. Neither mechanism proves that every line of source code is safe; review the source and release changes when that assurance is required.

## Development supply chain

The project toolchain is declared in `mise.toml` and locked in `mise.lock`. CI regenerates the Linux x64, macOS arm64, and Windows x64 lock entries and fails on drift. Tool artifacts use recorded SHA-256 checksums and upstream provenance where available, and locked installs re-verify supported provenance.

External GitHub Actions are pinned to immutable commit SHAs. Pull requests pass GitHub Dependency Review, while weekly Dependabot groups are subject to a seven-day cooldown for routine npm and GitHub Actions updates. CodeQL scans the JavaScript/TypeScript and Python source using GitHub's `security-extended` query suite.

## Threads alias resolver

The Cloudflare Worker at `resolver.mythic3011.com` is intentionally not a generic proxy. It accepts only constrained Threads `/share/<token>` aliases, validates every redirect hop against the Threads host allowlist, omits browser credentials, bounds request and response sizes, and applies a fixed upstream deadline. Successful alias-to-canonical mappings may be cached internally, while browser-facing responses remain `no-store`.

## Reporting

Do not put credentials, session cookies, private post contents, or other secrets in public bug reports. For ordinary non-sensitive defects, use the repository issue tracker. If a report contains exploit details or sensitive data, use GitHub's private vulnerability reporting flow when it is enabled for the repository instead of opening a public issue.
