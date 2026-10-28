import { backup } from "node:sqlite";
import { mkdirSync, chmodSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Service } from "./service.ts";

export class Maintenance {
  private pending?: Promise<string | undefined>;
  private timers: ReturnType<typeof setInterval>[] = [];
  private initial?: ReturnType<typeof setTimeout>;
  constructor(
    private service: Service,
    private directory: string,
    private keep = 7,
  ) {
    if (!Number.isInteger(keep) || keep < 1 || keep > 365)
      throw new Error("BACKUP_KEEP must be between 1 and 365");
  }
  runBackup(): Promise<string | undefined> {
    if (this.pending) return this.pending;
    this.pending = this.copy().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }
  private async copy() {
    this.service.history.maintain();
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    chmodSync(this.directory, 0o700);
    const name = `conest-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.sqlite`;
    const temporary = join(this.directory, name + ".tmp");
    const destination = join(this.directory, name);
    try {
      await backup(this.service.store.db, temporary);
      chmodSync(temporary, 0o600);
      renameSync(temporary, destination);
      const copies = readdirSync(this.directory, { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isFile() &&
            /^conest-\d{4}-\d{2}-\d{2}T[\d-]+Z-[a-f0-9-]+\.sqlite$/.test(
              entry.name,
            ),
        )
        .map((entry) => entry.name)
        .sort()
        .reverse();
      for (const obsolete of copies.slice(this.keep))
        rmSync(join(this.directory, obsolete));
      return destination;
    } finally {
      rmSync(temporary, { force: true });
    }
  }
  start(hours = 24) {
    if (!Number.isFinite(hours) || hours < 0 || hours > 8760)
      throw new Error("BACKUP_INTERVAL_HOURS must be between 0 and 8760");
    if (this.initial || this.timers.length) return;
    const report = (error: unknown) =>
      console.error(
        "Chat maintenance failed:",
        error instanceof Error ? error.message : "Unknown error",
      );
    const retain = () => {
      try {
        this.service.history.maintain();
      } catch (error) {
        report(error);
      }
    };
    retain();
    this.timers.push(setInterval(retain, 3600000).unref());
    if (hours > 0) {
      const copy = () => {
        void this.runBackup().catch(report);
      };
      this.initial = setTimeout(copy, 5000).unref();
      // Node timers cannot exceed a signed 32-bit delay.
      let due = Date.now() + hours * 3600000;
      this.timers.push(
        setInterval(
          () => {
            if (Date.now() >= due) {
              due = Date.now() + hours * 3600000;
              copy();
            }
          },
          Math.min(hours * 3600000, 3600000),
        ).unref(),
      );
    }
  }
  async stop() {
    if (this.initial) clearTimeout(this.initial);
    this.initial = undefined;
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
    await this.pending;
  }
}
