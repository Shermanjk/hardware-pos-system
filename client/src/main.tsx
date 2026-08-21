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

createRoot(document.getElementById("root")!).render(<App />);
