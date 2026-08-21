/**
 * Silent HTML Printer Utility for Kiosk POS Systems
 * 
 * Injects thermal receipt HTML into a hidden container in the top-level document,
 * applies an isolated @media print style isolating the receipt, and invokes
 * window.print() directly on the main window.
 * 
 * This ensures Chrome's `--kiosk-printing` flag completely suppresses the print
 * preview dialog and silently dispatches the receipt to the Windows default thermal printer.
 */

const CONTAINER_ID = "__pos_receipt_print_container__";
const STYLE_ID = "__pos_receipt_print_style__";

export function printHtmlSilently(html: string): void {
  // Remove any leftover previous receipt container and print style
  document.getElementById(CONTAINER_ID)?.remove();
  document.getElementById(STYLE_ID)?.remove();

  // Create isolated print stylesheet: hides app layout, displays only receipt container
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @media print {
      body > *:not(#${CONTAINER_ID}) {
        display: none !important;
      }
      #${CONTAINER_ID} {
        display: block !important;
        position: static !important;
        width: 80mm !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      @page {
        size: 80mm auto;
        margin: 0;
      }
    }
  `;
  document.head.appendChild(style);

  // Create receipt container (hidden from viewport during normal interaction)
  const container = document.createElement("div");
  container.id = CONTAINER_ID;
  container.style.cssText =
    "position:fixed;top:-9999px;left:-9999px;width:80mm;visibility:hidden;pointer-events:none;";
  container.setAttribute("aria-hidden", "true");

  // Extract <style> and <body> from provided HTML if present
  const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

  if (styleMatch) {
    const receiptStyle = document.createElement("style");
    receiptStyle.textContent = styleMatch[1];
    container.appendChild(receiptStyle);
  }

  const contentDiv = document.createElement("div");
  contentDiv.innerHTML = bodyMatch ? bodyMatch[1] : html;
  container.appendChild(contentDiv);

  document.body.appendChild(container);

  // Trigger main window print — intercepted and handled silently by --kiosk-printing
  requestAnimationFrame(() => {
    try {
      window.print();
    } catch (err) {
      console.error("[SilentPrinter] window.print() failed:", err);
    }

    // Clean up DOM after printing
    setTimeout(() => {
      document.getElementById(CONTAINER_ID)?.remove();
      document.getElementById(STYLE_ID)?.remove();
    }, 2000);
  });
}
