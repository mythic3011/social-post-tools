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
2. Use the in-page install button when offered, or the browser's **Install app / Add to Home screen** command.
3. From X / Threads, tap **Share** and choose **Social Post Tools**.

The in-page install control is capability-driven: it is hidden until the browser fires `beforeinstallprompt`. This avoids presenting a dead install button on browsers that do not expose the custom install prompt.

## Which one should I install?

| Starting point | Recommended surface |
|---|---|
| X / Threads in a desktop browser | Userscript |
| X / Threads in a compatible mobile browser | Userscript if the browser/manager combination supports it |
| X / Threads native Android app | Android companion PWA |
| Both browser and native Android app | Install both |

The two surfaces share canonical URL and link-builder behavior but have different capabilities. The PWA cannot scrape rich X / Threads DOM from a native-app share; rich semantic capture belongs to the Userscript.
