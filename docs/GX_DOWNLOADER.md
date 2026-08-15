# Built-in GX Mod Archive Downloader

Voidfox bundles the GX Mod Archive Downloader as a GeckoView built-in WebExtension.
It is installed with GeckoView's `ensureBuiltIn()` API and is scoped to GX Store pages.

## Runtime scope

The content script runs only on:

- `https://store.gx.me/*`

Package requests are accepted only for HTTPS URLs under:

- `mods.store.gx.me/mods/`
- `play.gxc.gg/mods/`

Redirect targets are validated again, downloads are capped at 512 MiB, and CRX2/CRX3
headers are parsed before ZIP export. Downloaded mod code is never installed or run.

## UI

When a GX mod package is discovered, the page gets a small **Archive GX Mod** control
with three actions:

- Download raw ZIP
- Download original CRX
- Copy direct package URL

## Architecture

- `content.js` discovers package URLs and renders the GX archive panel.
- `background.js` owns privileged network access, URL validation, CRX parsing, and
  Gecko's `browser.downloads` calls.
- `VoidfoxBuiltInExtensions.kt` installs the extension from APK assets at startup.

The original userscript is retained in `vendor/gx-mod-downloader/` for provenance.
