# Voidfox

**Voidfox** is a Firefox/Fenix fork project, starting with Android.

This repository currently contains the Voidfox-specific Android overlay rather than a vendored copy of Mozilla's entire Firefox monorepo. The overlay is designed to apply cleanly to a current `mozilla-firefox/firefox` checkout, which keeps upstream rebases manageable while Voidfox develops its own browser features and branding.

## Android identity

- Brand: **Voidfox**
- Android application ID: `dev.alastorkaneki.voidfox`
- Keeps the upstream `org.mozilla.fenix` Kotlin/Java namespace for compatibility for now
- Independent Voidfox deep-link schemes
- No Firefox release/beta `sharedUserId` inheritance
- Main, Nightly, Beta, and Release labels rebranded to Voidfox
- Generated transparent Voidfox fox emblem used for launcher branding
- Legacy launcher densities, adaptive icon foreground/background, and Android 13+ monochrome themed icon support

## Built-in GX Mod Archive Downloader

Voidfox includes **GX Mod Archive Downloader** as a bundled GeckoView WebExtension. On `https://store.gx.me/*`, it exposes:

- **Download raw ZIP**
- **Download original CRX**
- **Copy direct URL**

No userscript manager or WebView wrapper is required.

The privileged background side only accepts HTTPS package URLs from the known GX CDN hosts `mods.store.gx.me` and `play.gxc.gg`, requires `/mods/` paths, validates redirect targets again, caps package downloads at 512 MiB, and validates CRX2/CRX3 payloads before raw ZIP export. It does not install or execute GX mod code.

The original GX userscript is retained under `vendor/gx-mod-downloader/` for provenance. The runtime implementation under the Fenix overlay is adapted to Gecko WebExtension APIs.

See [`docs/GX_DOWNLOADER.md`](docs/GX_DOWNLOADER.md).

## One-command local source checkout

```bash
./scripts/bootstrap_local_fork.sh Voidfox-Firefox
```

That clones Mozilla's upstream Firefox source locally and applies this repository's Voidfox overlay. It does not create another GitHub repository or push anything automatically.

## Apply to an existing Firefox checkout

```bash
python3 scripts/apply_voidfox.py /path/to/firefox
```

Then build Android:

```bash
cd /path/to/firefox
./mach gradle fenix:assembleDebug
```

Or use:

```bash
./scripts/build_voidfox.sh /path/to/firefox
```

## Why an overlay first?

Firefox is a very large monorepo. Keeping the initial Voidfox-specific work as a deterministic overlay makes upstream rebases and review of Voidfox changes much easier. As the fork diverges, more of the browser source can be maintained directly here if needed.

## Branding

`branding/source/voidfox-icon.png` is the generated transparent fox-only emblem used as the Android app icon. Android launcher resources under `branding/res/` are derived from it.

## Licensing and trademarks

Voidfox is an independent project and is not affiliated with or endorsed by Mozilla. Firefox and Mozilla names/logos remain subject to their respective trademark policies. Upstream Mozilla code retains its original licensing. The vendored GX Mod Archive Downloader userscript retains its MIT license; see `vendor/gx-mod-downloader/LICENSE`.
