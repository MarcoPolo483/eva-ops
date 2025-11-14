type Handler = (event: { topic: string; data: any }) => void;

export class EventBus {
  private subs: { pattern: string; handler: Handler }[] = [];

  subscribe(pattern: string, handler: Handler) {
    this.subs.push({ pattern, handler });
    return () => {
      const idx = this.subs.findIndex((s) => s.handler === handler && s.pattern === pattern);
      if (idx >= 0) this.subs.splice(idx, 1);
    };
  }

  publish(topic: string, data: any) {
    for (const s of this.subs) {
      if (matches(s.pattern, topic)) {
        try {
          s.handler({ topic, data });
        } catch {
          // swallow handler error
        }
      }
    }
  }

  list() {
    return this.subs.slice();
  }
}

function matches(pattern: string, topic: string): boolean {
  if (pattern === topic) return true;
  if (pattern.endsWith(".*")) {
    const base = pattern.slice(0, -2);
    return topic.startsWith(base + ".");
  }
  return false;
}