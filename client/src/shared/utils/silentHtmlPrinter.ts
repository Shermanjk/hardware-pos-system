/**
 * Silent HTML Printer Utility for POS Systems
 * 
 * Renders thermal receipt HTML inside an isolated hidden iframe
 * ensuring pixel-perfect 80mm formatting without inheriting main-page CSS resets.
 */

export function printHtmlSilently(html: string): void {
  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;top:-9999px;left:-9999px;width:80mm;height:0;border:none;visibility:hidden;pointer-events:none;";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const cleanup = () => {
    try {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    } catch {
      // Ignored
    }
  };

  const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (!doc) {
    cleanup();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const win = iframe.contentWindow;
  if (win) {
    let printed = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const handlePrint = () => {
      if (printed) return;
      printed = true;
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      try {
        win.print();
      } catch (e) {
        console.error("[SilentPrinter] iframe print error:", e);
      }
      setTimeout(cleanup, 2000);
    };

    if (doc.readyState === "complete") {
      handlePrint();
    } else {
      win.addEventListener("load", handlePrint, { once: true });
      fallbackTimer = setTimeout(handlePrint, 250);
    }
  } else {
    setTimeout(cleanup, 2000);
  }
}
