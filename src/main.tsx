import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Bump this whenever we want to force install/PWA clients to drop stale caches.
const APP_VERSION = "2026.04.25.3";
const APP_VERSION_KEY = "app-version";

if (typeof window !== "undefined") {
  try {
    const previous = localStorage.getItem(APP_VERSION_KEY);
    if (previous !== APP_VERSION) {
      // Cleanup outdated SW caches that may still be serving an old bundle on PWAs
      if ("caches" in window) {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
      }
      // Clear stale branding cache so old logo / login background do not flash
      try {
        localStorage.removeItem("platform-branding-cache-v1");
      } catch {
        // ignore
      }
      localStorage.setItem(APP_VERSION_KEY, APP_VERSION);
    }
  } catch {
    // ignore quota / privacy mode errors
  }
}

// Service Worker handling:
// - Preview/iframe/dev: unregister any SW + clear caches (avoids stale builds)
// - Production on custom domain: register minimal /sw.js for PWA installability
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  const isInIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();
  const isPreviewHost =
    window.location.hostname.includes("id-preview--") ||
    window.location.hostname.includes("lovableproject.com");

  if (isPreviewHost || isInIframe || !import.meta.env.PROD) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister()))
      .catch(() => {});
    if ("caches" in window) {
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
    }
  } else {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }
}

// Global safety net: if a dynamic import fails (stale chunk after deploy),
// clear caches and reload once. Guarded by sessionStorage to avoid loops.
if (typeof window !== "undefined") {
  const RELOAD_KEY = "chunk-reload-attempt";
  const isChunkErr = (msg: string) =>
    /Importing a module script failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /Loading CSS chunk/i.test(msg);
  const tryReload = () => {
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) || "0");
      if (Date.now() - last < 30000) return;
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      if ("caches" in window) {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
      }
      window.location.reload();
    } catch {
      // ignore
    }
  };
  window.addEventListener("error", (e) => {
    if (e?.message && isChunkErr(e.message)) tryReload();
  });
  window.addEventListener("unhandledrejection", (e) => {
    const msg = (e?.reason as { message?: string })?.message || String(e?.reason || "");
    if (isChunkErr(msg)) tryReload();
  });
}

const rootEl = document.getElementById("root")!;
createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Hide the boot loader as soon as React paints the first frame
requestAnimationFrame(() => {
  document.documentElement.classList.add("app-mounted");
});
