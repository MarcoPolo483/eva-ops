import type { IncomingMessage, ServerResponse } from "http";

import type { MeterRegistry } from "../core/registry.js";

export function httpMetrics(registry: MeterRegistry) {
    const requests = registry.counter("http_requests_total", "Total HTTP requests", ["method", "route", "status"]);
    const duration = registry.histogram("http_request_duration_seconds", "HTTP request duration", undefined, ["method", "route"]);

    return async (req: IncomingMessage, res: ServerResponse, route: string, handler: () => Promise<void>) => {
        const timer = registry.timer();
        const stop = timer.start();
        const method = req.method || "GET";

        try {
            await handler();
        } finally {
            const d = stop();
            const status = String(res.statusCode || 200);

            requests.inc({ method, route, status });
            duration.observe({ method, route }, d);
        }
    };
}
