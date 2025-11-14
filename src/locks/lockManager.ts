export type Lease = { key: string; expiresAt: number; token: string };

export class LockManager {
  private locks = new Map<string, Lease>();

  acquire(key: string, ttlMs: number): Lease {
    const existing = this.locks.get(key);
    const now = Date.now();
    if (existing && existing.expiresAt > now) throw new Error("Lock held");
    const lease: Lease = { key, expiresAt: now + ttlMs, token: generateToken() };
    this.locks.set(key, lease);
    return lease;
  }

  release(lease: Lease) {
    const current = this.locks.get(lease.key);
    if (!current) return;
    if (current.token !== lease.token) throw new Error("Lease token mismatch");
    this.locks.delete(lease.key);
  }

  extend(lease: Lease, ttlMs: number) {
    const current = this.locks.get(lease.key);
    if (!current || current.token !== lease.token) throw new Error("Cannot extend");
    current.expiresAt = Date.now() + ttlMs;
  }

  status() {
    const now = Date.now();
    return Array.from(this.locks.values()).map(l => ({ key: l.key, remainingMs: l.expiresAt - now }));
  }

  reapExpired() {
    const now = Date.now();
    for (const [k, l] of this.locks) {
      if (l.expiresAt <= now) this.locks.delete(k);
    }
  }
}

function generateToken() {
  return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
}