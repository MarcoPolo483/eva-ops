import { ISafetyGate, LoadedDocument } from "./types.js";

export type SafetyEnhancedOptions = {
  sanitize?: boolean;
  replacement?: string;
};

export type SafetyDocResult = {
  docId: string;
  status: "allowed" | "blocked" | "sanitized";
};

export class SafetyEnhancedGate implements ISafetyGate {
  constructor(
    private evaluator: (text: string) => { blocked: boolean; shouldSanitize?: boolean },
    private opts: SafetyEnhancedOptions = {}
  ) {}

  async check(docs: LoadedDocument[]) {
    const allowed: LoadedDocument[] = [];
    const blocked: LoadedDocument[] = [];
    for (const d of docs) {
      const ev = this.evaluator(d.content);
      if (ev.blocked) {
        if (ev.shouldSanitize && this.opts.sanitize) {
          const replaced = this.opts.replacement ?? "[REDACTED]";
            allowed.push({ ...d, content: replaced });
        } else {
          blocked.push(d);
        }
      } else {
        allowed.push(d);
      }
    }
    return { allowed, blocked };
  }
}