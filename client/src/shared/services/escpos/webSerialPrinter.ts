/**
 * Web Serial Direct Thermal Printer Service
 * Connects directly to USB/Serial 80mm thermal receipt printers without browser dialogs or preview overlays.
 */

import { toast } from "sonner";
import { buildTestReceiptEscpos } from "./escposBuilder";

export interface SerialPrinterState {
  isSupported: boolean;
  isConnected: boolean;
  portName?: string;
  baudRate: number;
}

type StateListener = (state: SerialPrinterState) => void;

class WebSerialPrinterService {
  private port: any = null;
  private writer: any = null;
  private listeners: Set<StateListener> = new Set();
  private baudRate = 9600; // Standard default for most USB-Serial thermal POS printers (9600, 38400, or 115200)

  constructor() {
    // Load saved baud rate from localStorage if present
    const savedBaud = localStorage.getItem("pos_serial_baud_rate");
    if (savedBaud) {
      const parsed = parseInt(savedBaud, 10);
      if (!isNaN(parsed) && parsed > 0) this.baudRate = parsed;
    }

    if (this.isSupported()) {
      (navigator as any).serial?.addEventListener("disconnect", (e: any) => {
        console.warn("[WebSerial] Printer disconnected:", e);
        this.handleDisconnect();
      });

      // Try auto-reconnecting to previously paired port on startup
      this.autoConnect();
    }
  }

  /** Check if Web Serial API is supported in the current browser */
  isSupported(): boolean {
    return typeof navigator !== "undefined" && "serial" in navigator;
  }

  /** Check if a serial printer port is currently open and ready to write */
  isConnected(): boolean {
    return this.port !== null && this.port.writable !== null;
  }

  /** Get current printer status snapshot */
  getState(): SerialPrinterState {
    return {
      isSupported: this.isSupported(),
      isConnected: this.isConnected(),
      baudRate: this.baudRate,
    };
  }

  /** Subscribe to connection state updates */
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const state = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(state);
      } catch (e) {
        console.error("Error in serial printer listener:", e);
      }
    });
  }

  /** Update baud rate setting */
  setBaudRate(rate: number) {
    this.baudRate = rate;
    localStorage.setItem("pos_serial_baud_rate", String(rate));
    this.notify();
  }

  /**
   * Request user to pair their USB thermal printer via browser port picker
   */
  async requestAndConnect(): Promise<boolean> {
    if (!this.isSupported()) {
      toast.error("Web Serial is not supported in this browser. Please use Chrome or Edge.");
      return false;
    }

    try {
      // Prompt user to pick device
      const port = await (navigator as any).serial.requestPort();
      if (!port) return false;

      await this.openPort(port);
      toast.success("Thermal Printer connected via Direct USB!");
      return true;
    } catch (err: any) {
      if (err.name === "NotFoundError" || err.name === "AbortError") {
        // User cancelled port selection dialog
        return false;
      }
      console.error("[WebSerial] Connection error:", err);
      toast.error(`Failed to connect printer: ${err.message || err}`);
      return false;
    }
  }

  /**
   * Automatically connect to the first previously granted serial port
   */
  async autoConnect(): Promise<boolean> {
    if (!this.isSupported() || this.isConnected()) return false;

    try {
      const ports = await (navigator as any).serial.getPorts();
      if (ports && ports.length > 0) {
        const port = ports[0];
        await this.openPort(port);
        console.log("[WebSerial] Auto-connected to previously paired thermal printer.");
        return true;
      }
    } catch (err) {
      console.warn("[WebSerial] Auto-connect attempt skipped:", err);
    }
    return false;
  }

  private async openPort(port: any): Promise<void> {
    try {
      // Close previous writer/port if open
      await this.closePort();

      // Common standard thermal baud rates: 9600, 19200, 38400, 115200
      await port.open({
        baudRate: this.baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: "none",
        flowControl: "none",
      });

      this.port = port;
      this.notify();
    } catch (e: any) {
      this.port = null;
      this.notify();
      throw e;
    }
  }

  private async closePort(): Promise<void> {
    try {
      if (this.writer) {
        await this.writer.releaseLock();
        this.writer = null;
      }
      if (this.port) {
        await this.port.close();
        this.port = null;
      }
    } catch (e) {
      console.warn("[WebSerial] Error closing port:", e);
      this.port = null;
      this.writer = null;
    }
    this.notify();
  }

  private handleDisconnect() {
    this.port = null;
    this.writer = null;
    this.notify();
    toast.warning("Direct Thermal Printer disconnected.");
  }

  /**
   * Disconnect and release the current printer port
   */
  async disconnect(): Promise<void> {
    await this.closePort();
    toast.info("Thermal printer disconnected.");
  }

  /**
   * Send raw binary ESC/POS bytes directly over the USB serial connection
   */
  async printRaw(bytes: Uint8Array): Promise<boolean> {
    if (!this.isConnected()) {
      return false;
    }

    try {
      const writer = this.port.writable.getWriter();
      await writer.write(bytes);
      writer.releaseLock();
      return true;
    } catch (err: any) {
      console.error("[WebSerial] Print transmission error:", err);
      // Attempt quick re-open if port was busy or lock failed
      try {
        if (this.writer) {
          await this.writer.releaseLock();
          this.writer = null;
        }
      } catch {
        /* ignore */
      }
      return false;
    }
  }

  /**
   * Send ESC/POS cash drawer kick pulse
   */
  async openCashDrawer(): Promise<boolean> {
    if (!this.isConnected()) {
      toast.warning("No Direct USB thermal printer connected.");
      return false;
    }
    // ESC p 0 25 250
    const kickBytes = new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]);
    const ok = await this.printRaw(kickBytes);
    if (ok) {
      toast.success("Cash drawer kicked.");
    } else {
      toast.error("Failed to pulse cash drawer.");
    }
    return ok;
  }

  /**
   * Print a quick zero-flash test receipt
   */
  async printTestReceipt(storeName = "ISRA HARDWARE POS"): Promise<boolean> {
    if (!this.isConnected()) {
      toast.warning("Please connect the USB Thermal Printer first.");
      return false;
    }

    const testBytes = buildTestReceiptEscpos(storeName);
    const ok = await this.printRaw(testBytes);
    if (ok) {
      toast.success("Test receipt transmitted directly to printer (0% flash)!");
    } else {
      toast.error("Failed to send test receipt.");
    }
    return ok;
  }
}

export const webSerialPrinter = new WebSerialPrinterService();
