#!/usr/bin/env bash
set -euo pipefail

REPO="${1:-mythic3011/social-post-tools}"
DESCRIPTION="Privacy-first X (Twitter) & Threads sharing toolkit: Userscript, Android PWA Share Target, clean links, alternative frontends, and structured AI capture."
HOMEPAGE="https://share-tools.mythic3011.com/"
TOPICS="userscript,pwa,progressive-web-app,web-share,web-share-target,tampermonkey,violentmonkey,twitter,threads,social-media,nitter,ai,android,privacy,github-pages,javascript,pico-css,url-cleaner"

command -v gh >/dev/null 2>&1 || { echo "GitHub CLI (gh) is required." >&2; exit 1; }
gh auth status >/dev/null

gh repo edit "$REPO" \
  --description "$DESCRIPTION" \
  --homepage "$HOMEPAGE" \
  --add-topic "$TOPICS"

echo "Updated GitHub About metadata for $REPO"
echo "Next: Settings -> General -> Social preview -> upload src/pwa/assets/social-preview.png"
