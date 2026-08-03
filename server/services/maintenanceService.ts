import { EventEmitter } from "events";

/**
 * Coordinates the short quiesce period required before a database/application
 * update. State is deliberately process-local: a freshly restarted process is
 * out of maintenance only after the update workflow has completed.
 */
class MaintenanceService {
  private maintenance = false;
  private readonly operations = new Set<string>();
  private readonly events = new EventEmitter();

  isMaintenanceMode(): boolean {
    return this.maintenance;
  }

  enter(): boolean {
    if (this.maintenance) return false;
    this.maintenance = true;
    return true;
  }

  exit(): void {
    this.maintenance = false;
    this.events.emit("state");
  }

  beginCriticalOperation(): string | null {
    if (this.maintenance) return null;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.operations.add(id);
    return id;
  }

  finishCriticalOperation(id: string): void {
    if (this.operations.delete(id)) this.events.emit("state");
  }

  activeOperationCount(): number {
    return this.operations.size;
  }

  async waitForDrain(timeoutMs = 5 * 60 * 1000): Promise<boolean> {
    if (this.operations.size === 0) return true;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => done(false), timeoutMs);
      const check = () => {
        if (this.operations.size === 0) done(true);
      };
      const done = (drained: boolean) => {
        clearTimeout(timeout);
        this.events.off("state", check);
        resolve(drained);
      };
      this.events.on("state", check);
      check();
    });
  }
}

export const maintenanceService = new MaintenanceService();
