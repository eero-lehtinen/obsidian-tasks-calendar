import { Modal, Setting } from "obsidian";
import type { App } from "obsidian";

export type PerformanceMetric =
  | "index.initial"
  | "index.file"
  | "index.update-latency"
  | "render.calendar";

interface Measurement {
  duration: number;
  timestamp: number;
  details?: Record<string, number>;
}

export interface PerformanceSummary {
  metric: PerformanceMetric;
  count: number;
  average: number;
  p50: number;
  p95: number;
  maximum: number;
  latest: number;
  latestDetails?: Record<string, number>;
}

const MAX_SAMPLES_PER_METRIC = 500;

export class PerformanceMonitor {
  private readonly measurements = new Map<PerformanceMetric, Measurement[]>();
  private startedAt = Date.now();

  record(metric: PerformanceMetric, duration: number, details?: Record<string, number>): void {
    const samples = this.measurements.get(metric) ?? [];
    samples.push({ duration, timestamp: Date.now(), details });
    if (samples.length > MAX_SAMPLES_PER_METRIC) {
      samples.splice(0, samples.length - MAX_SAMPLES_PER_METRIC);
    }
    this.measurements.set(metric, samples);
  }

  summaries(): PerformanceSummary[] {
    return Array.from(this.measurements.entries()).map(([metric, measurements]) => {
      const sorted = measurements.map((measurement) => measurement.duration).sort((left, right) => left - right);
      const latest = measurements[measurements.length - 1];
      return {
        metric,
        count: measurements.length,
        average: sorted.reduce((total, duration) => total + duration, 0) / sorted.length,
        p50: percentile(sorted, 0.5),
        p95: percentile(sorted, 0.95),
        maximum: sorted[sorted.length - 1],
        latest: latest.duration,
        latestDetails: latest.details
      };
    });
  }

  reset(): void {
    this.measurements.clear();
    this.startedAt = Date.now();
  }

  report(): string {
    const lines = [
      "Tasks Calendar performance report",
      `Captured: ${new Date().toISOString()}`,
      `Measurement window: ${formatDuration(Date.now() - this.startedAt)}`,
      "",
      "Metric | Samples | Average | P50 | P95 | Max | Latest"
    ];
    for (const summary of this.summaries()) {
      lines.push([
        summary.metric,
        summary.count,
        formatDuration(summary.average),
        formatDuration(summary.p50),
        formatDuration(summary.p95),
        formatDuration(summary.maximum),
        formatDuration(summary.latest)
      ].join(" | "));
      if (summary.latestDetails) {
        lines.push(`  Latest details: ${formatDetails(summary.latestDetails)}`);
      }
    }
    if (this.measurements.size === 0) lines.push("No measurements recorded.");
    return lines.join("\n");
  }
}

export class PerformanceReportModal extends Modal {
  constructor(app: App, private readonly monitor: PerformanceMonitor) {
    super(app);
  }

  onOpen(): void {
    this.setTitle("Tasks Calendar performance");
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("p", {
      text: "Measurements are retained in memory for the current Obsidian session. Up to 500 samples are kept per metric.",
      cls: "setting-item-description"
    });

    const summaries = this.monitor.summaries();
    if (summaries.length === 0) {
      contentEl.createEl("p", { text: "No measurements recorded yet." });
    } else {
      const table = contentEl.createEl("table", { cls: "tasks-calendar-performance-table" });
      const header = table.createEl("thead").createEl("tr");
      for (const label of ["Metric", "Samples", "Average", "P50", "P95", "Max", "Latest"]) {
        header.createEl("th", { text: label });
      }
      const body = table.createEl("tbody");
      for (const summary of summaries) {
        const row = body.createEl("tr");
        row.createEl("td", { text: metricLabel(summary.metric) });
        row.createEl("td", { text: String(summary.count) });
        row.createEl("td", { text: formatDuration(summary.average) });
        row.createEl("td", { text: formatDuration(summary.p50) });
        row.createEl("td", { text: formatDuration(summary.p95) });
        row.createEl("td", { text: formatDuration(summary.maximum) });
        row.createEl("td", {
          text: summary.latestDetails
            ? `${formatDuration(summary.latest)} (${formatDetails(summary.latestDetails)})`
            : formatDuration(summary.latest)
        });
      }
    }

    new Setting(contentEl)
      .addButton((button) => button
        .setButtonText("Copy report")
        .setCta()
        .onClick(async () => {
          await navigator.clipboard.writeText(this.monitor.report());
          button.setButtonText("Copied");
        }))
      .addButton((button) => button
        .setButtonText("Reset measurements")
        .setWarning()
        .onClick(() => {
          this.monitor.reset();
          this.render();
        }));
  }
}

function percentile(sorted: number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1) return `${milliseconds.toFixed(2)} ms`;
  if (milliseconds < 100) return `${milliseconds.toFixed(1)} ms`;
  return `${Math.round(milliseconds)} ms`;
}

function formatDetails(details: Record<string, number>): string {
  return Object.entries(details).map(([key, value]) => `${key}=${value}`).join(", ");
}

function metricLabel(metric: PerformanceMetric): string {
  const labels: Record<PerformanceMetric, string> = {
    "index.initial": "Initial vault index",
    "index.file": "File indexing",
    "index.update-latency": "File event → indexed",
    "render.calendar": "Calendar render"
  };
  return labels[metric];
}
