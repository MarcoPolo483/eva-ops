export interface SafetyGate {
  check(content: string, metadata?: Record<string, unknown>): Promise<{ safe: boolean; reason?: string }>;
}

export class NoopSafetyGate implements SafetyGate {
  async check(_content: string, _metadata?: Record<string, unknown>): Promise<{ safe: boolean; reason?: string }> {
    return { safe: true };
  }
}

export class BlocklistSafetyGate implements SafetyGate {
  constructor(private blockedPatterns: RegExp[]) {}

  async check(content: string, _metadata?: Record<string, unknown>): Promise<{ safe: boolean; reason?: string }> {
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(content)) {
        return { safe: false, reason: `Content matches blocked pattern: ${pattern}` };
      }
    }
    return { safe: true };
  }
}

export class SafetyPolicyGate implements SafetyGate {
  constructor(private policy: (text: string) => { blocked: boolean; reason?: string }) {}

  async check(content: string, _metadata?: Record<string, unknown>): Promise<{ safe: boolean; reason?: string }> {
    const result = this.policy(content);
    return { safe: !result.blocked, reason: result.reason };
  }
}
