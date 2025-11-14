export class Config {
  private data: Record<string, unknown> = {};
  private frozen = false;

  loadEnv(keys: string[]) {
    for (const k of keys) {
      if (process.env[k] !== undefined) this.data[k] = process.env[k];
    }
    return this;
  }

  merge(obj: Record<string, unknown>) {
    this.assertNotFrozen();
    Object.assign(this.data, obj);
    return this;
  }

  get<T = unknown>(key: string): T | undefined {
    return this.data[key] as T | undefined;
  }

  all(): Record<string, unknown> {
    return { ...this.data };
  }

  watch(cb: (snap: Record<string, unknown>) => void) {
    // In-memory watcher (manual trigger)
    return {
      trigger: () => cb(this.all())
    };
  }

  freeze() {
    this.frozen = true;
    return this;
  }

  isFrozen() { return this.frozen; }

  private assertNotFrozen() {
    if (this.frozen) throw new Error("Config is frozen");
  }
}