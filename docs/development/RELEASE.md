# Release workflow

Social Post Tools uses one source release version, reproducible tool/dependency locks, a tested generated distribution branch, and immutable version tags.

## 1. Bump the version

Use the repository helper rather than editing version fields independently:

```bash
python scripts/set-version.py 4.5.0
```

The helper synchronizes:

- `VERSION`
- `package.json`
- `package-lock.json`
- `pyproject.toml`
- the project entry in `uv.lock`
- the README version badge

Add the matching `CHANGELOG.md` section manually so the release notes stay deliberate rather than generated from commit text.

The version must be plain semantic versioning: `MAJOR.MINOR.PATCH`.

## 2. Validate locally

Install only the reviewed toolchain and locked project dependencies:

```bash
mise install --locked
mise run bootstrap
```

Then run the production-equivalent checks:

```bash
mise run check
```

CI additionally regenerates the cross-platform `mise.lock` entries and reruns `scripts/set-version.py` with the current `VERSION`; both operations must produce no diff.

## 3. Merge through a pull request

Before merge, the pull request should have successful runs for:

- CI
- Dependency Review
- CodeQL for JavaScript/TypeScript and Python
- Threads Resolver validation

The PR remains the review boundary. Do not publish a distribution directly from an unreviewed feature branch.

## 4. Main-branch distribution

A merge to `main` starts `Publish Userscript Distribution`.

The workflow is intentionally split into two privilege domains:

### Build job

The build job has only `contents: read` permission. It:

1. installs the locked mise toolchain and project dependencies;
2. builds the canonical public Userscript;
3. runs the full regression suite;
4. checks whether `dist-v<VERSION>` already exists;
5. creates `SHA256SUMS.txt` and `release.json`; and
6. uploads the tested `dist/` directory as a short-lived GitHub Actions artifact.

If the immutable version tag already exists, publication stops. A source change that should reach Userscript clients therefore requires a new `VERSION`.

### Publish job

Only the publish job receives `contents: write`, `id-token: write`, and `attestations: write`. It does not rebuild the project. It:

1. downloads the tested artifact produced by the build job;
2. rechecks `SHA256SUMS.txt`;
3. creates GitHub/Sigstore Artifact Attestations for the checksummed files;
4. publishes the generated `dist` branch used by Raw GitHub update URLs; and
5. creates immutable tag `dist-v<VERSION>` on the generated distribution commit.

The moving `dist` branch is the canonical Tampermonkey/Violentmonkey update channel. The version tag is the immutable CDN/reference point.

## 5. Verify the release

Check the expected paths after the distribution workflow succeeds:

```text
https://raw.githubusercontent.com/mythic3011/social-post-tools/dist/social-post-tools.user.js
https://raw.githubusercontent.com/mythic3011/social-post-tools/dist/social-post-tools.meta.js
https://cdn.jsdelivr.net/gh/mythic3011/social-post-tools@dist-v<VERSION>/social-post-tools.user.js
```

Download the generated files and verify their checksum manifest:

```bash
sha256sum --check SHA256SUMS.txt
```

Verify GitHub build provenance:

```bash
gh attestation verify social-post-tools.user.js -R mythic3011/social-post-tools
```

Confirm the generated Userscript contains the expected version:

```bash
grep '^// @version' social-post-tools.user.js
```

## 6. Failure and recovery rules

- **Tests fail:** do not publish. Fix source/tests in another PR.
- **Version tag already exists:** do not move or delete it to reuse the version. Bump `VERSION` and release again.
- **Artifact handoff/checksum fails:** treat the run as unpublished; do not manually force the `dist` branch to compensate.
- **Attestation fails:** do not publish the distribution without provenance as an ad-hoc workaround.
- **`dist` push succeeds but immutable tag push fails:** investigate before retrying. Because the tag is absent, a retry can rebuild and verify the same source/version, but compare the generated digest with the existing `dist/release.json` first.
- **Urgent rollback:** publish a new higher semantic version containing the rollback. Do not rewrite an already published `dist-v<VERSION>` tag.

## Updating dependencies and tools

Routine npm and GitHub Actions updates are grouped by Dependabot and held behind the configured cooldown. Toolchain updates should be made through `mise.toml`, followed by regenerating `mise.lock` and reviewing the changed artifact URLs/checksums/provenance.

Do not weaken `locked_verify_provenance`, switch GitHub Actions back to floating tags, or bypass the lock files just to make a transient upstream failure disappear.
