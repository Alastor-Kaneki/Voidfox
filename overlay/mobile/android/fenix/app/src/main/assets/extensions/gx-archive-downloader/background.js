"use strict";

const SUPPORTED_HOSTS = new Set(["mods.store.gx.me", "play.gxc.gg"]);
const MAX_DOWNLOAD_BYTES = 512 * 1024 * 1024;
const ZIP_SIGNATURES = [
  [0x50, 0x4b, 0x03, 0x04],
  [0x50, 0x4b, 0x05, 0x06],
  [0x50, 0x4b, 0x07, 0x08],
];

function validatePackageUrl(value) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch (_) {
    throw new Error("Invalid GX package URL.");
  }

  if (url.protocol !== "https:" || !SUPPORTED_HOSTS.has(url.hostname)) {
    throw new Error("GX package host is not allowed.");
  }
  if (!url.pathname.startsWith("/mods/")) {
    throw new Error("GX package URL is outside /mods/.");
  }

  url.username = "";
  url.password = "";
  url.hash = "";
  return url;
}

function sanitizeFilename(value, fallback) {
  const text = String(value || fallback || "gx-mod")
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 160);
  return text || fallback || "gx-mod";
}

function readUInt32LE(bytes, offset) {
  if (offset + 4 > bytes.length) throw new Error("Truncated CRX header.");
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function hasPrefix(bytes, prefix, offset = 0) {
  return bytes.length >= offset + prefix.length &&
    prefix.every((value, index) => bytes[offset + index] === value);
}

function isZip(bytes, offset = 0) {
  return ZIP_SIGNATURES.some((signature) => hasPrefix(bytes, signature, offset));
}

function extractZip(bytes) {
  if (isZip(bytes)) return bytes;
  if (!hasPrefix(bytes, [0x43, 0x72, 0x32, 0x34])) {
    throw new Error("Package is neither CRX nor ZIP.");
  }

  const version = readUInt32LE(bytes, 4);
  let offset;
  if (version === 2) {
    offset = 16 + readUInt32LE(bytes, 8) + readUInt32LE(bytes, 12);
  } else if (version === 3) {
    offset = 12 + readUInt32LE(bytes, 8);
  } else {
    throw new Error(`Unsupported CRX version: ${version}.`);
  }

  if (offset >= bytes.length || !isZip(bytes, offset)) {
    throw new Error("CRX payload is not a valid ZIP archive.");
  }
  return bytes.slice(offset);
}

async function fetchPackage(value) {
  const requestedUrl = validatePackageUrl(value);
  const response = await fetch(requestedUrl.href, {
    method: "GET",
    credentials: "omit",
    redirect: "follow",
    cache: "no-store",
  });

  // Re-validate the final target so a CDN redirect cannot escape the GX allowlist.
  validatePackageUrl(response.url);

  if (!response.ok) {
    throw new Error(`GX CDN returned HTTP ${response.status}.`);
  }

  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_DOWNLOAD_BYTES) {
    throw new Error("GX package exceeds the 512 MiB safety limit.");
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_DOWNLOAD_BYTES) {
    throw new Error("GX package exceeds the 512 MiB safety limit.");
  }

  return new Uint8Array(buffer);
}

async function saveBytes(bytes, filename, mimeType) {
  const blob = new Blob([bytes], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  try {
    return await browser.downloads.download({
      url: objectUrl,
      filename: sanitizeFilename(filename, "gx-mod"),
      saveAs: false,
      conflictAction: "uniquify",
    });
  } finally {
    // Gecko keeps the Blob alive for an active download; defer cleanup to avoid
    // revoking it before the download subsystem has consumed the URL.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 120000);
  }
}

function validSender(sender) {
  if (!sender || !sender.url) return false;
  try {
    const url = new URL(sender.url);
    return url.protocol === "https:" && url.hostname === "store.gx.me";
  } catch (_) {
    return false;
  }
}

browser.runtime.onMessage.addListener(async (message, sender) => {
  if (!validSender(sender)) {
    throw new Error("GX downloader request came from an unexpected page.");
  }

  if (!message || typeof message !== "object") {
    throw new Error("Invalid GX downloader request.");
  }

  if (message.type === "downloadOriginalCrx") {
    const bytes = await fetchPackage(message.url);
    const id = await saveBytes(bytes, message.filename || "gx-mod.crx", "application/x-chrome-extension");
    return { ok: true, downloadId: id };
  }

  if (message.type === "downloadRawZip") {
    const bytes = await fetchPackage(message.url);
    const zip = extractZip(bytes);
    const id = await saveBytes(zip, message.filename || "gx-mod.zip", "application/zip");
    return { ok: true, downloadId: id };
  }

  throw new Error("Unknown GX downloader request.");
});
