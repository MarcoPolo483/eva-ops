import type { IncomingMessage, ServerResponse } from "http";

import type { MeterRegistry } from "../core/registry.js";

export function httpMetrics(registry: MeterRegistry) {
    const requests = registry.counter("http_requests_total", "Total HTTP requests", ["method", "path", "status"]);
    const duration = registry.histogram("http_request_duration_seconds", "HTTP request duration", undefined, ["method", "path"]);

    return (req: IncomingMessage, res: ServerResponse) => {
        const timer = registry.timer();
        const stop = timer.start();

        res.on("finish", () => {
            const d = stop();
            const method = req.method || "GET";
            const path = req.url || "/";
            const status = String(res.statusCode);

            requests.inc({ method, path, status });
            duration.observe({ method, path }, d);
        });
    };
}
