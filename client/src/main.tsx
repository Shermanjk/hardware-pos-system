import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Clean up any stale or past service workers from previous builds
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
    }
  }).catch(() => {
    /* ignore service worker cleanup errors */
  });
}

// Clean up any temporary _kiosk cache-bust param from URL once loaded
if (window.location.search.includes("_kiosk=")) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("_kiosk");
    window.history.replaceState({}, "", url.pathname + (url.searchParams.toString() ? "?" + url.searchParams.toString() : "") + url.hash);
  } catch {
    /* ignore history errors */
  }
}

createRoot(document.getElementById("root")!).render(<App />);
