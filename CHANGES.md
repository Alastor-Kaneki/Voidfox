# Voidfox Android changes

1. Change Android application ID from Mozilla's package ID to `dev.alastorkaneki.voidfox`.
2. Give debug/nightly/beta/benchmark independent suffixes.
3. Change Fenix deep-link schemes to Voidfox schemes.
4. Remove Firefox release/beta shared-user ID inheritance.
5. Rebrand app labels to `Voidfox`.
6. Replace launcher + round launcher icons with the generated Voidfox emblem.
7. Add adaptive icon and monochrome themed-icon resources.
8. Bundle GX Mod Archive Downloader as a built-in Gecko WebExtension.
9. Scope GX injection to `store.gx.me` and privileged package access to the two GX CDN `/mods/` paths.
10. Revalidate GX redirect targets, enforce the 512 MiB cap, and preserve CRX2/CRX3 raw-ZIP export.
