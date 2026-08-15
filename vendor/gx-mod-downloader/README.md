# GX Mod Downloader source provenance

`gx-archive-downloader.user.js` is the GX Mod Archive Downloader v1.2.0 userscript
recovered from the Android artifact produced by `Alastor-Kaneki/GX-Mod-Downloader`.

Voidfox does **not** inject this file verbatim. The runtime implementation under
`overlay/mobile/android/fenix/app/src/main/assets/extensions/gx-archive-downloader/`
keeps its package discovery/UI behavior and adapts network/download operations to
Firefox/Gecko WebExtension APIs.
