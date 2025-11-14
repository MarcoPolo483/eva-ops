export type AuditEvent = {
  ts: string;
  actor?: string;
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
};

export class AuditTrail {
  private events: AuditEvent[] = [];
  constructor(private capacity = 5000) {}

  record(e: Omit<AuditEvent, "ts">) {
    if (this.events.length === this.capacity) this.events.shift();
    this.events.push({ ts: new Date().toISOString(), ...e });
  }

  query(filter?: { actor?: string; action?: string }): AuditEvent[] {
    return this.events.filter(ev => {
      if (filter?.actor && ev.actor !== filter.actor) return false;
      if (filter?.action && ev.action !== filter.action) return false;
      return true;
    });
  }

  all() { return this.events.slice(); }
}