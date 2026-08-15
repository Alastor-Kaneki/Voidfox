// ==UserScript==
// @name         GX Mod Archive Downloader
// @namespace    https://store.gx.me/
// @version      1.2.0
// @description  Download GX Store mods as original CRX backups or raw editable ZIP archives. Never installs or activates mods.
// @author       Alastor Kaneki
// @match        https://store.gx.me/*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_setClipboard
// @connect      mods.store.gx.me
// @connect      play.gxc.gg
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const SUPPORTED_HOSTS = new Set(["mods.store.gx.me", "play.gxc.gg"]);
  const CDN_URL_RE = /(?:https:)?\/\/(?:mods\.store\.gx\.me|play\.gxc\.gg)\/mods\/[^\s"'<>\\]+/gi;

  let packageUrl = null;
  let modName = "gx-mod";
  let lastLocation = location.href;
  let preparedZipUrl = null;
  let preparedZipName = null;

  function decodeCandidateText(value) {
    return String(value || "")
      .replace(/&amp;/gi, "&")
      .replace(/\\u0026/gi, "&")
      .replace(/\\\//g, "/");
  }

  function cleanMatchedUrl(value) {
    return value
      .replace(/^\/\//, "https://")
      .replace(/[),.;}\]]+$/g, "");
  }

  function normalizeGXUrl(value) {
    if (!value) return null;
    const text = decodeCandidateText(value);
    const matches = text.match(CDN_URL_RE) || [];

    for (const rawMatch of matches) {
      let parsed;
      try {
        parsed = new URL(cleanMatchedUrl(rawMatch));
      } catch (_) {
        continue;
      }

      if (parsed.protocol !== "https:" || !SUPPORTED_HOSTS.has(parsed.hostname)) continue;

      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parts[0] !== "mods") continue;

      if (parts.at(-1) === "mod.crx" && parts.length >= 5) {
        parsed.search = "";
        parsed.hash = "";
        return parsed.href;
      }

      const markerIndex = parts.findIndex((part) => part === "contents" || part === "icons");
      if (markerIndex >= 4) {
        parsed.pathname = `/${parts.slice(0, markerIndex).concat("mod.crx").join("/")}`;
        parsed.search = "";
        parsed.hash = "";
        return parsed.href;
      }
    }

    return null;
  }

  function sanitize(value) {
    return String(value || "gx-mod")
      .normalize("NFKC")
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
      .replace(/\s+/g, " ")
      .replace(/[. ]+$/g, "")
      .trim()
      .slice(0, 120) || "gx-mod";
  }

  function collectStrings() {
    const values = performance.getEntriesByType("resource").map((entry) => entry.name);
    const selector = [
      "img", "source", "video", "meta", "link", "script",
      "[style]", "[data-src]", "[data-url]", "[data-original]", "[poster]"
    ].join(",");

    for (const element of document.querySelectorAll(selector)) {
      for (const attribute of [
        "src", "currentSrc", "srcset", "href", "content", "style",
        "data-src", "data-url", "data-original", "poster"
      ]) {
        const value = element[attribute] || element.getAttribute?.(attribute);
        if (value) values.push(value);
      }

      if (element.tagName === "SCRIPT" && element.textContent) {
        if (element.textContent.includes("mods.store.gx.me/mods/") ||
            element.textContent.includes("play.gxc.gg/mods/")) {
          values.push(element.textContent);
        }
      }
    }

    return values;
  }

  function resetPreparedZip() {
    if (preparedZipUrl) URL.revokeObjectURL(preparedZipUrl);
    preparedZipUrl = null;
    preparedZipName = null;
  }

  function discover() {
    const candidates = [
      document.querySelector("h1")?.textContent,
      document.querySelector('meta[property="og:title"]')?.content,
      document.title.replace(/\s*[|–-]\s*GX Store.*$/i, ""),
      location.pathname.split("/").filter(Boolean).at(-1)
    ];

    modName = sanitize(candidates.find((item) => item?.trim()));
    packageUrl = collectStrings().map(normalizeGXUrl).find(Boolean) || null;
    updateUi();
    return packageUrl;
  }

  function readUInt32LE(bytes, offset) {
    if (offset + 4 > bytes.length) throw new Error("Truncated CRX header.");
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
  }

  function hasPrefix(bytes, prefix, offset = 0) {
    return bytes.length >= offset + prefix.length && prefix.every((value, index) => bytes[offset + index] === value);
  }

  function isZip(bytes, offset = 0) {
    return [
      [0x50, 0x4b, 0x03, 0x04],
      [0x50, 0x4b, 0x05, 0x06],
      [0x50, 0x4b, 0x07, 0x08]
    ].some((signature) => hasPrefix(bytes, signature, offset));
  }

  function extractZip(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    if (isZip(bytes)) return bytes;
    if (!hasPrefix(bytes, [0x43, 0x72, 0x32, 0x34])) throw new Error("Package is neither CRX nor ZIP.");

    const version = readUInt32LE(bytes, 4);
    let offset;
    if (version === 2) {
      offset = 16 + readUInt32LE(bytes, 8) + readUInt32LE(bytes, 12);
    } else if (version === 3) {
      offset = 12 + readUInt32LE(bytes, 8);
    } else {
      throw new Error(`Unsupported CRX version: ${version}.`);
    }

    if (!isZip(bytes, offset)) throw new Error("CRX payload is not a valid ZIP archive.");
    return bytes.slice(offset);
  }

  function triggerAnchorDownload(url, filename, revokeAfter = false) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.style.display = "none";
    document.documentElement.appendChild(anchor);
    anchor.click();
    anchor.remove();
    if (revokeAfter) setTimeout(() => URL.revokeObjectURL(url), 120000);
  }

  function gmRequest(details) {
    if (typeof GM_xmlhttpRequest === "function") return GM_xmlhttpRequest(details);
    if (typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function") return GM.xmlHttpRequest(details);
    throw new Error("Your userscript manager does not provide cross-origin requests.");
  }

  function requestRawZip() {
    if (preparedZipUrl && preparedZipName) {
      triggerAnchorDownload(preparedZipUrl, preparedZipName, false);
      setMessage(`Download requested again: ${preparedZipName}`);
      return;
    }

    if (!packageUrl && !discover()) {
      setMessage("No GX package URL found. Reload the mod page and wait for its icon to appear.", true);
      return;
    }

    if (window.GXArchiveNative?.downloadRawZip) {
      setMessage("Downloading the GX package and extracting its ZIP natively…");
      window.GXArchiveNative.downloadRawZip(
        packageUrl,
        `${modName}.zip`,
        () => setMessage("Raw ZIP archive saved."),
        (error) => setMessage(error?.error || "Native ZIP export failed.", true)
      );
      return;
    }

    setMessage("Downloading the GX package and extracting its ZIP…");
    try {
      gmRequest({
        method: "GET",
        url: packageUrl,
        responseType: "arraybuffer",
        anonymous: true,
        timeout: 60000,
        onload(response) {
          try {
            if (response.status < 200 || response.status >= 300) {
              throw new Error(`GX CDN returned HTTP ${response.status}.`);
            }
            const zip = extractZip(response.response);
            resetPreparedZip();
            preparedZipName = `${modName}.zip`;
            preparedZipUrl = URL.createObjectURL(new Blob([zip], { type: "application/zip" }));
            triggerAnchorDownload(preparedZipUrl, preparedZipName, false);
            setMessage(`ZIP prepared. If the browser did not save it, tap “Download raw ZIP” again.`);
          } catch (error) {
            setMessage(error instanceof Error ? error.message : String(error), true);
          }
        },
        onerror() { setMessage("The GX CDN request failed. Check the wrapper's host permission.", true); },
        ontimeout() { setMessage("The GX CDN request timed out.", true); }
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error), true);
    }
  }

  function requestOriginalCrx() {
    if (!packageUrl && !discover()) {
      setMessage("No GX package URL found. Reload the mod page and wait for its icon to appear.", true);
      return;
    }

    const filename = `${modName}.crx`;
    setMessage("Starting original CRX backup…");

    const gmDownloader = typeof GM_download === "function"
      ? GM_download
      : (typeof GM !== "undefined" && typeof GM.download === "function" ? GM.download.bind(GM) : null);

    if (gmDownloader) {
      try {
        gmDownloader({
          url: packageUrl,
          name: filename,
          saveAs: false,
          onload() { setMessage("Original CRX backup saved."); },
          onerror() {
            triggerAnchorDownload(packageUrl, filename, false);
            setMessage("Opened the CRX directly because the wrapper download API failed.");
          }
        });
        return;
      } catch (_) {
      }
    }

    triggerAnchorDownload(packageUrl, filename, false);
    setMessage("Opened the original CRX using the browser's normal download flow.");
  }

  function copyUrl() {
    if (!packageUrl && !discover()) {
      setMessage("No GX package URL found. Reload the mod page and wait for its icon to appear.", true);
      return;
    }

    try {
      if (typeof GM_setClipboard === "function") {
        GM_setClipboard(packageUrl, "text");
      } else if (typeof GM !== "undefined" && typeof GM.setClipboard === "function") {
        GM.setClipboard(packageUrl, "text");
      } else {
        navigator.clipboard.writeText(packageUrl);
      }
      setMessage("Direct package URL copied.");
    } catch (_) {
      window.prompt("Copy the GX package URL:", packageUrl);
    }
  }

  let status;
  let message;
  let toggle;
  let buttons = [];

  function setMessage(text, error = false) {
    if (!message) return;
    message.textContent = text;
    message.style.color = error ? "#ff8686" : "#71f7a7";
  }

  function updateUi() {
    if (!status) return;
    status.textContent = packageUrl
      ? `Ready: ${modName}`
      : "Searching this GX Store page for its current mod package…";
    buttons.forEach((button) => { button.disabled = !packageUrl; });
    toggle.textContent = packageUrl ? "● Archive GX Mod" : "Archive GX Mod";
  }

  function makeButton(label, subtitle, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.innerHTML = `${label}<small>${subtitle}</small>`;
    button.addEventListener("click", handler);
    buttons.push(button);
    return button;
  }

  function mount() {
    const host = document.createElement("div");
    host.dataset.gxArchiveDownloader = "true";
    host.style.cssText = "all:initial;position:fixed;right:max(14px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));z-index:2147483647;font-family:system-ui,sans-serif;color-scheme:dark";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>
      *{box-sizing:border-box} #panel{width:min(330px,calc(100vw - 28px));margin-bottom:10px;padding:14px;border:1px solid #ffffff29;border-radius:18px;background:#0a090ef7;color:#fff;box-shadow:0 18px 55px #0008} #panel[hidden]{display:none} h2{margin:0 0 5px;font-size:16px} p{margin:0 0 12px;color:#b9b4c3;font-size:12px;line-height:1.4} #actions{display:grid;gap:8px} button{appearance:none;border:1px solid #ffffff22;border-radius:12px;background:#1a1720;color:#fff;padding:10px 12px;text-align:left;font:700 13px/1.2 system-ui;cursor:pointer} button:disabled{opacity:.45} button small{display:block;color:#aaa3b3;font-size:11px;font-weight:500;margin-top:3px} #toggle{border-radius:999px;min-height:48px;padding:0 17px;background:linear-gradient(135deg,#17111f,#09090d);box-shadow:0 12px 38px #0008} #msg{min-height:17px;margin-top:10px;color:#71f7a7;font-size:11px;font-weight:600}
    </style><section id="panel" hidden><h2>GX Mod Archive Downloader</h2><p id="status"></p><div id="actions"></div><div id="msg"></div></section><button id="toggle">Archive GX Mod</button>`;
    status = shadow.getElementById("status");
    message = shadow.getElementById("msg");
    toggle = shadow.getElementById("toggle");
    const panel = shadow.getElementById("panel");
    const actions = shadow.getElementById("actions");
    actions.append(
      makeButton("Download raw ZIP", "Editable archive only; nothing is installed.", requestRawZip),
      makeButton("Download original CRX", "Unmodified backup from GX's CDN.", requestOriginalCrx),
      makeButton("Copy direct URL", "Copies the public mod.crx address.", copyUrl)
    );
    toggle.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) discover();
    });
    document.documentElement.appendChild(host);
    updateUi();
  }

  mount();
  discover();

  new MutationObserver(() => {
    if (!packageUrl) discover();
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true });

  setInterval(() => {
    if (location.href !== lastLocation) {
      lastLocation = location.href;
      packageUrl = null;
      resetPreparedZip();
      setMessage("");
    }
    discover();
  }, 2000);

  window.addEventListener("pagehide", resetPreparedZip, { once: true });
})();
