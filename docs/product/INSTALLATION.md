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

1. Open <https://share-tools.mythic3011.com/> in **Google Chrome for Android**.
2. Tap **Install app**. If Chrome exposes a native install prompt, Social Post Tools opens it; otherwise the same button shows manual installation guidance.
3. From X / Threads, tap **Share** and choose **Social Post Tools**.

### Android browser support

| Browser | PWA install | Android Share Target | Project support |
|---|---:|---:|---|
| Google Chrome | Yes | Supported path | **Supported** |
| Brave | Build/version dependent | Experimental; may require a developer Web App install setting | Best effort |
| Firefox | Yes | Not guaranteed to register as a system share target | PWA-only fallback |
| Other Android browsers | Varies | Varies | Not verified |

The public landing page detects the platform/browser before the main stylesheet is applied, keeps the PWA install path primary, and moves the browser Userscript into an optional disclosure. The install CTA never depends on `beforeinstallprompt` being present just to be usable. The install dialog reports HTTPS, service-worker, native-prompt, standalone-mode, and Share Target support state.

### Threads `/share/` links

The Threads Android app may send a public URL such as `https://www.threads.com/share/<id>` instead of an exact `https://www.threads.com/@user/post/<id>` permalink. Social Post Tools treats that as a **supported Threads share alias**, not an unsupported URL. It can immediately share, copy, or open the alias, but it deliberately waits for Threads to resolve the exact post before running alternate-link conversion or rich AI capture.

If an Android device keeps showing an older UI after a deployment, close/reopen the site or clear that site's stored data once. v4.2.4 keeps the Android-first install funnel while v4.2.3 introduced version-tagged install-critical assets and uses network-first service-worker handling for navigations, JavaScript, CSS, and the manifest to reduce stale PWA shells after releases.

## Which one should I install?

| Starting point | Recommended surface |
|---|---|
| X / Threads in a desktop browser | Userscript |
| X / Threads in a compatible mobile browser | Userscript if the browser/manager combination supports it |
| X / Threads native Android app | Android companion PWA |
| Both browser and native Android app | Install both |

The two surfaces share canonical URL and link-builder behavior but have different capabilities. The PWA cannot scrape rich X / Threads DOM from a native-app share; rich semantic capture belongs to the Userscript.
