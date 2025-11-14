import type { MetricSnapshot } from "../core/registry.js";

function escapeLabel(v: string): string {
    return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function decodeLabels(key: string, keys: string[]): Record<string, string> {
    const parts = key ? key.split("\x01") : [];
    const map: Record<string, string> = {};
    keys.forEach((k, i) => {
        const [_, v] = (parts[i] ?? `${k}\x00`).split("\x00");
        map[k] = v ?? "";
    });
    return map;
}

function formatLabels(labels: Record<string, string>): string {
    const pairs = Object.entries(labels).map(([k, v]) => `${k}="${escapeLabel(v)}"`);
    return pairs.length > 0 ? `{${pairs.join(",")}}` : "";
}

export function prometheusText(snap: MetricSnapshot): string {
    const lines: string[] = [];

    for (const counter of snap.counters) {
        if (counter.help) lines.push(`# HELP ${counter.name} ${counter.help}`);
        lines.push(`# TYPE ${counter.name} counter`);
        for (const [key, value] of counter.values) {
            const labels = decodeLabels(key, counter.labelKeys);
            lines.push(`${counter.name}${formatLabels(labels)} ${value}`);
        }
    }

    for (const gauge of snap.gauges) {
        if (gauge.help) lines.push(`# HELP ${gauge.name} ${gauge.help}`);
        lines.push(`# TYPE ${gauge.name} gauge`);
        for (const [key, value] of gauge.values) {
            const labels = decodeLabels(key, gauge.labelKeys);
            lines.push(`${gauge.name}${formatLabels(labels)} ${value}`);
        }
    }

    for (const hist of snap.histograms) {
        if (hist.help) lines.push(`# HELP ${hist.name} ${hist.help}`);
        lines.push(`# TYPE ${hist.name} histogram`);
        for (const [key, rec] of hist.values) {
            const labels = decodeLabels(key, hist.labelKeys);
            const labelStr = formatLabels(labels);
            for (let i = 0; i < hist.buckets.length; i++) {
                const bucketLabels = { ...labels, le: String(hist.buckets[i]) };
                lines.push(`${hist.name}_bucket${formatLabels(bucketLabels)} ${rec.counts[i]}`);
            }
            const infLabels = { ...labels, le: "+Inf" };
            lines.push(`${hist.name}_bucket${formatLabels(infLabels)} ${rec.count}`);
            lines.push(`${hist.name}_sum${labelStr} ${rec.sum}`);
            lines.push(`${hist.name}_count${labelStr} ${rec.count}`);
        }
    }

    return lines.join("\n") + "\n";
}
