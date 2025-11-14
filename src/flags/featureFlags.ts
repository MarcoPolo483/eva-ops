export type FlagDefinition =
  | {
      key: string;
      type: "boolean";
      default: boolean;
      dependsOn?: string[];               // all must be true
      activeWindow?: { start?: number; end?: number };
    }
  | {
      key: string;
      type: "ratio";
      percentage: number;
      default?: boolean;
      dependsOn?: string[];
      stickyKey?: string;                 // if provided, deterministic hash rollout by this context field
      activeWindow?: { start?: number; end?: number };
    };

export class FeatureFlags {
  private defs = new Map<string, FlagDefinition>();

  define(def: FlagDefinition) {
    if (this.defs.has(def.key)) throw new Error("Flag already defined: " + def.key);
    this.defs.set(def.key, def);
    return this;
  }

  list() {
    return Array.from(this.defs.values());
  }

  evaluate(
    key: string,
    context?: { random?: number; [k: string]: string | number | boolean | undefined }
  ): boolean {
    const def = this.defs.get(key);
    if (!def) throw new Error("Flag not defined: " + key);

    // Time window gating
    if (def.activeWindow) {
      const now = Date.now();
      if (def.activeWindow.start && now < def.activeWindow.start) return false;
      if (def.activeWindow.end && now > def.activeWindow.end) return false;
    }

    // Dependencies first
    if (def.dependsOn && def.dependsOn.length) {
      for (const dep of def.dependsOn) {
        if (!this.evaluate(dep, context)) return false;
      }
    }

    if (def.type === "boolean") return def.default;

    // Sticky deterministic rollout
    if (def.stickyKey && context && context[def.stickyKey] !== undefined) {
      const basis = String(context[def.stickyKey]);
      const h = hashString(basis); // [0, 1)
      return h < def.percentage / 100;
    }

    const r = context?.random ?? Math.random();
    return r < def.percentage / 100;
  }
}

function hashString(s: string): number {
  // FNV-1a 32-bit then scale to [0,1)
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h / 0xffffffff;
}