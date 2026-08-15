// Adapted for Voidfox from GX Mod Archive Downloader v1.2.0.
// Original source is retained under vendor/gx-mod-downloader/.
(function () {
  "use strict";

  if (window.__VOIDFOX_GX_ARCHIVE_DOWNLOADER__) return;
  window.__VOIDFOX_GX_ARCHIVE_DOWNLOADER__ = true;

  const SUPPORTED_HOSTS = new Set(["mods.store.gx.me", "play.gxc.gg"]);
  const CDN_URL_RE = /(?:https:)?\/\/(?:mods\.store\.gx\.me|play\.gxc\.gg)\/mods\/[^\s"'<>\\]+/gi;

  let packageUrl = null;
  let modName = "gx-mod";
  let lastLocation = location.href;
  let status;
  let message;
  let toggle;
  const buttons = [];

  function decodeCandidateText(value) {
    return String(value || "")
      .replace(/&amp;/gi, "&")
      .replace(/\\u0026/gi, "&")
      .replace(/\\\//g, "/");
  }

  function cleanMatchedUrl(value) {
    return value.replace(/^\/\//, "https://").replace(/[),.;}\]]+$/g, "");
  }

  function normalizeGXUrl(value) {
    if (!value) return null;
    const matches = decodeCandidateText(value).match(CDN_URL_RE) || [];

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
      "[style]", "[data-src]", "[data-url]", "[data-original]", "[poster]",
    ].join(",");

    for (const element of document.querySelectorAll(selector)) {
      for (const attribute of [
        "src", "currentSrc", "srcset", "href", "content", "style",
        "data-src", "data-url", "data-original", "poster",
      ]) {
        const value = element[attribute] || element.getAttribute?.(attribute);
        if (value) values.push(value);
      }

      if (element.tagName === "SCRIPT" && element.textContent) {
        if (
          element.textContent.includes("mods.store.gx.me/mods/") ||
          element.textContent.includes("play.gxc.gg/mods/")
        ) {
          values.push(element.textContent);
        }
      }
    }
    return values;
  }

  function discover() {
    const candidates = [
      document.querySelector("h1")?.textContent,
      document.querySelector('meta[property="og:title"]')?.content,
      document.title.replace(/\s*[|–-]\s*GX Store.*$/i, ""),
      location.pathname.split("/").filter(Boolean).at(-1),
    ];

    modName = sanitize(candidates.find((item) => item?.trim()));
    packageUrl = collectStrings().map(normalizeGXUrl).find(Boolean) || null;
    updateUi();
    return packageUrl;
  }

  function setMessage(text, error = false) {
    if (!message) return;
    message.textContent = text;
    message.style.color = error ? "#ff8686" : "#71f7a7";
  }

  function ensurePackageUrl() {
    if (packageUrl || discover()) return true;
    setMessage("No GX package URL found. Reload the mod page and wait for its icon to appear.", true);
    return false;
  }

  async function requestRawZip() {
    if (!ensurePackageUrl()) return;
    setMessage("Downloading the GX package and extracting its ZIP…");
    try {
      const result = await browser.runtime.sendMessage({
        type: "downloadRawZip",
        url: packageUrl,
        filename: `${modName}.zip`,
      });
      if (!result?.ok) throw new Error("Raw ZIP export did not start.");
      setMessage("Raw ZIP archive sent to Voidfox downloads.");
    } catch (error) {
      setMessage(error?.message || String(error), true);
    }
  }

  async function requestOriginalCrx() {
    if (!ensurePackageUrl()) return;
    setMessage("Downloading the original GX CRX…");
    try {
      const result = await browser.runtime.sendMessage({
        type: "downloadOriginalCrx",
        url: packageUrl,
        filename: `${modName}.crx`,
      });
      if (!result?.ok) throw new Error("Original CRX download did not start.");
      setMessage("Original CRX sent to Voidfox downloads.");
    } catch (error) {
      setMessage(error?.message || String(error), true);
    }
  }

  async function copyUrl() {
    if (!ensurePackageUrl()) return;
    try {
      await navigator.clipboard.writeText(packageUrl);
      setMessage("Direct package URL copied.");
    } catch (_) {
      window.prompt("Copy the GX package URL:", packageUrl);
    }
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
    if (document.querySelector('[data-voidfox-gx-archive-downloader="true"]')) return;

    const host = document.createElement("div");
    host.dataset.voidfoxGxArchiveDownloader = "true";
    host.style.cssText = "all:initial;position:fixed;right:max(14px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));z-index:2147483647;font-family:system-ui,sans-serif;color-scheme:dark";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>
      *{box-sizing:border-box} #panel{width:min(330px,calc(100vw - 28px));margin-bottom:10px;padding:14px;border:1px solid #ffffff29;border-radius:18px;background:#09070ff7;color:#fff;box-shadow:0 18px 55px #0008} #panel[hidden]{display:none} h2{margin:0 0 5px;font-size:16px} p{margin:0 0 12px;color:#b9b4c3;font-size:12px;line-height:1.4} #actions{display:grid;gap:8px} button{appearance:none;border:1px solid #ffffff22;border-radius:12px;background:#181120;color:#fff;padding:10px 12px;text-align:left;font:700 13px/1.2 system-ui;cursor:pointer} button:disabled{opacity:.45} button small{display:block;color:#aaa3b3;font-size:11px;font-weight:500;margin-top:3px} #toggle{border-radius:999px;min-height:48px;padding:0 17px;background:linear-gradient(135deg,#2b0c45,#09070d);box-shadow:0 12px 38px #0008} #msg{min-height:17px;margin-top:10px;color:#71f7a7;font-size:11px;font-weight:600}
    </style><section id="panel" hidden><h2>Voidfox GX Archive</h2><p id="status"></p><div id="actions"></div><div id="msg"></div></section><button id="toggle">Archive GX Mod</button>`;

    status = shadow.getElementById("status");
    message = shadow.getElementById("msg");
    toggle = shadow.getElementById("toggle");
    const panel = shadow.getElementById("panel");
    const actions = shadow.getElementById("actions");

    actions.append(
      makeButton("Download raw ZIP", "Editable archive only; nothing is installed.", requestRawZip),
      makeButton("Download original CRX", "Unmodified backup from GX's CDN.", requestOriginalCrx),
      makeButton("Copy direct URL", "Copies the public mod.crx address.", copyUrl),
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
      setMessage("");
    }
    discover();
  }, 2000);
})();
