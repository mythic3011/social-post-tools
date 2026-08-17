# Installation

Social Post Tools has two installation paths. They solve different problems and can be used together.

## Browser Userscript

Use this path when you browse X or Threads in a browser and want **Post tools** inside the site's Share menu.

### 1. Install a Userscript manager

Recommended default:

- [Tampermonkey — official site](https://www.tampermonkey.net/)

Supported open-source alternative:

- [Violentmonkey — official site](https://violentmonkey.github.io/)

Always obtain the manager from its official site/store path. Social Post Tools does not bundle, mirror, or redistribute these browser extensions.

### 2. Install Social Post Tools

Open the public browser setup page:

- <https://share-tools.mythic3011.com/install.html>

If a manager is already installed, the direct stable Userscript URL is:

- <https://share-tools.mythic3011.com/install/social-post-tools.user.js>

The generated Userscript also carries `@downloadURL` and `@updateURL` metadata pointing at the stable Pages endpoints.

### 3. Use it

Open X or Threads, open a post's Share menu, and choose **Post tools**. No settings change is required for the recommended defaults.

### Troubleshooting

If the `.user.js` URL shows plain JavaScript instead of an install confirmation, the Userscript manager is probably not installed, disabled, or not intercepting the link. Complete step 1 and retry.

## Android companion PWA

Use the PWA when the starting point is the native X / Threads Android app.

1. Open <https://share-tools.mythic3011.com/> in an install-capable Android browser.
2. Tap **Install app**. If the browser exposes a native install prompt, Social Post Tools opens it; otherwise the same button shows manual **Install app / Add to Home screen** steps.
3. From X / Threads, tap **Share** and choose **Social Post Tools**.

On Android, the public landing page detects the platform before the main stylesheet is applied, keeps the PWA install path primary, and moves the browser Userscript into an optional disclosure. The install CTA never depends on `beforeinstallprompt` being present just to be usable. Chromium-based browsers can expose that event and get a one-tap native prompt; browsers without the API fall back to manual installation guidance. The dialog also reports HTTPS, service-worker, native-prompt, and standalone-mode state for troubleshooting.

If an Android device keeps showing an older UI after a deployment, close/reopen the site or clear that site's stored data once. v4.2.4 keeps the Android-first install funnel while v4.2.3 introduced version-tagged install-critical assets and uses network-first service-worker handling for navigations, JavaScript, CSS, and the manifest to reduce stale PWA shells after releases.

## Which one should I install?

| Starting point | Recommended surface |
|---|---|
| X / Threads in a desktop browser | Userscript |
| X / Threads in a compatible mobile browser | Userscript if the browser/manager combination supports it |
| X / Threads native Android app | Android companion PWA |
| Both browser and native Android app | Install both |

The two surfaces share canonical URL and link-builder behavior but have different capabilities. The PWA cannot scrape rich X / Threads DOM from a native-app share; rich semantic capture belongs to the Userscript.
