import { describe, it, expect } from "vitest";
import { EventBus } from "../events/eventBus.js";

describe("EventBus", () => {
  it("wildcard subscription catches topic", () => {
    const bus = new EventBus();
    let seen = 0;
    bus.subscribe("user.*", () => { seen++; });
    bus.publish("user.created", { id: "u1" });
    bus.publish("user.deleted", { id: "u1" });
    expect(seen).toBe(2);
  });

  it("unsubscribe removes handler", () => {
    const bus = new EventBus();
    let seen = 0;
    const off = bus.subscribe("demo.*", () => { seen++; });
    bus.publish("demo.a", {});
    off();
    bus.publish("demo.b", {});
    expect(seen).toBe(1);
  });
});