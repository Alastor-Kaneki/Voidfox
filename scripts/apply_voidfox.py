#!/usr/bin/env python3
from pathlib import Path
import argparse, json, re, shutil, sys

HERE = Path(__file__).resolve().parent.parent
CFG = json.loads((HERE / "voidfox.json").read_text())
BRAND = CFG["brand"]
APP_ID = CFG["application_id"]

def replace_once(text, old, new, label):
    if old not in text:
        if new in text:
            return text
        raise RuntimeError(f"Could not find expected {label}: {old!r}")
    return text.replace(old, new, 1)

def patch_build_gradle(path):
    text = path.read_text()
    text = replace_once(text, 'applicationId "org.mozilla"', f'applicationId "{APP_ID}"', "base applicationId")
    text = text.replace('applicationIdSuffix ".fenix.debug"', 'applicationIdSuffix ".debug"')
    text = text.replace('applicationIdSuffix ".firefox_beta"', 'applicationIdSuffix ".beta"')

    # Nightly and benchmark both currently use ".fenix"; keep them unique in Voidfox.
    if 'applicationIdSuffix ".fenix"' in text:
        text = text.replace('applicationIdSuffix ".fenix"', 'applicationIdSuffix ".nightly"', 1)
    if 'applicationIdSuffix ".fenix"' in text:
        text = text.replace('applicationIdSuffix ".fenix"', 'applicationIdSuffix ".benchmark"', 1)

    text = text.replace('applicationIdSuffix ".firefox"', '// Voidfox release uses the base applicationId')

    text = text.replace('"fenix-dev"', '"voidfox-dev"')
    text = text.replace('"fenix-nightly"', '"voidfox-nightly"')
    text = text.replace('"fenix-beta"', '"voidfox-beta"')
    text = re.sub(
        r'def deepLinkSchemeValue = "fenix"(\s*)',
        r'def deepLinkSchemeValue = "voidfox"\1',
        text,
    )

    # Voidfox must never inherit Firefox's signing-coupled sharedUserId.
    text = re.sub(
        r'\s*"sharedUserId":\s*"org\.mozilla\.firefox\.sharedID",?',
        '',
        text,
    )
    path.write_text(text)

def neutral_manifest(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("""<?xml version="1.0" encoding="utf-8"?>
<!-- Voidfox intentionally does not inherit Firefox's sharedUserId. -->
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
</manifest>
""")

def patch_static_strings(path, flavor):
    if not path.exists():
        return
    text = path.read_text()
    text = re.sub(
        r'(<string\s+name="app_name"\s+translatable="false">)(.*?)(</string>)',
        rf'\1{BRAND}\3',
        text,
        count=1,
    )
    text = re.sub(
        r'(<string\s+name="firefox"\s+translatable="false">)(.*?)(</string>)',
        rf'\1{BRAND}\3',
        text,
        count=1,
    )
    path.write_text(text)

def copy_branding(app_dir):
    src = HERE / "branding" / "res"
    dst = app_dir / "src" / "main" / "res"
    for item in src.rglob("*"):
        if item.is_file():
            rel = item.relative_to(src)
            out = dst / rel
            out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, out)

    # Use the generated transparent emblem directly as the adaptive foreground.
    icon_source = HERE / "branding" / "source" / "voidfox-icon.png"
    foreground = dst / "drawable-nodpi" / "voidfox_launcher_foreground.png"
    foreground.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(icon_source, foreground)

    # Debug has its own launcher resources upstream, so override those too.
    debug_res = app_dir / "src" / "debug" / "res"
    for density in ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]:
        for name in ["ic_launcher.png", "ic_launcher_round.png"]:
            source = src / f"mipmap-{density}" / name
            out = debug_res / f"mipmap-{density}" / name
            out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, out)

    for name in ["ic_launcher.xml", "ic_launcher_round.xml"]:
        source = src / "mipmap-anydpi" / name
        out = debug_res / "mipmap-anydpi" / name
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, out)


def copy_overlay(firefox_root):
    src = HERE / "overlay"
    if not src.is_dir():
        return
    for item in src.rglob("*"):
        if not item.is_file():
            continue
        rel = item.relative_to(src)
        out = firefox_root / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(item, out)

def patch_fenix_application(path):
    text = path.read_text()
    call = "        org.mozilla.fenix.voidfox.VoidfoxBuiltInExtensions.install(this)\n"
    if call not in text:
        needle = "        initializeWebExtensionSupport()\n"
        if needle not in text:
            raise RuntimeError("Could not locate Fenix WebExtension initialization hook")
        text = text.replace(needle, needle + "\n" + call, 1)
    path.write_text(text)

def main():
    ap = argparse.ArgumentParser(description="Apply Voidfox Android branding to a current Firefox source checkout.")
    ap.add_argument("firefox_root", type=Path, help="Root of the mozilla-firefox/firefox checkout")
    args = ap.parse_args()

    root = args.firefox_root.resolve()
    app = root / "mobile" / "android" / "fenix" / "app"
    if not (app / "build.gradle").exists():
        sys.exit(f"Not a Firefox source checkout: {app / 'build.gradle'} was not found")

    patch_build_gradle(app / "build.gradle")

    for flavor in ["main", "nightly", "beta", "release"]:
        patch_static_strings(
            app / "src" / flavor / "res" / "values" / "static_strings.xml",
            flavor,
        )

    neutral_manifest(app / "src" / "beta" / "AndroidManifest.xml")
    neutral_manifest(app / "src" / "release" / "AndroidManifest.xml")
    copy_branding(app)
    copy_overlay(root)
    patch_fenix_application(
        app / "src" / "main" / "java" / "org" / "mozilla" / "fenix" / "FenixApplication.kt"
    )

    marker = root / ".voidfox-applied"
    marker.write_text(
        f"{BRAND}\napplicationId={APP_ID}\n"
        "builtInExtension=gx-archive-downloader@voidfox\n"
        "Applied by Voidfox-Android bootstrap overlay.\n"
    )

    print(f"Applied {BRAND} Android fork overlay.")
    print(f"Application ID: {APP_ID}")
    print("Build with: ./mach gradle fenix:assembleDebug")

if __name__ == "__main__":
    main()
