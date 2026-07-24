import { Events, TFile, Vault } from "obsidian";
import type { PerformanceMonitor } from "./performance";
import { parseTaskLine } from "./task-parser";
import type { CalendarTask } from "./types";

export const TASKS_CHANGED_EVENT = "tasks-calendar:changed";

export class TaskStore extends Events {
  private readonly tasksByPath = new Map<string, CalendarTask[]>();
  private readonly refreshTimers = new Map<string, number>();
  private readonly scheduledAt = new Map<string, number>();

  constructor(
    private readonly vault: Vault,
    private readonly performanceMonitor: PerformanceMonitor
  ) {
    super();
  }

  async initialize(): Promise<void> {
    const startedAt = performance.now();
    const files = this.vault.getMarkdownFiles();
    await Promise.all(files.map((file) => this.indexFile(file)));
    this.performanceMonitor.record("index.initial", performance.now() - startedAt, {
      files: files.length,
      tasks: this.getTasks().length
    });
  }

  getTasks(): CalendarTask[] {
    return Array.from(this.tasksByPath.values()).flat();
  }

  scheduleFile(file: TFile): void {
    const existingTimer = this.refreshTimers.get(file.path);
    if (existingTimer !== undefined) window.clearTimeout(existingTimer);
    if (!this.scheduledAt.has(file.path)) this.scheduledAt.set(file.path, performance.now());
    const timer = window.setTimeout(() => {
      this.refreshTimers.delete(file.path);
      void this.indexFile(file).then(() => {
        const eventStartedAt = this.scheduledAt.get(file.path);
        this.scheduledAt.delete(file.path);
        if (eventStartedAt !== undefined) {
          this.performanceMonitor.record("index.update-latency", performance.now() - eventStartedAt);
        }
        this.trigger(TASKS_CHANGED_EVENT);
      });
    }, 120);
    this.refreshTimers.set(file.path, timer);
  }

  removePath(path: string): void {
    if (this.tasksByPath.delete(path)) this.trigger(TASKS_CHANGED_EVENT);
  }

  renamePath(file: TFile, oldPath: string): void {
    this.tasksByPath.delete(oldPath);
    void this.indexFile(file).then(() => this.trigger(TASKS_CHANGED_EVENT));
  }

  async indexFile(file: TFile): Promise<void> {
    if (file.extension !== "md") return;
    const startedAt = performance.now();
    const content = await this.vault.cachedRead(file);
    const tasks = content
      .split(/\r?\n/)
      .map((line, lineNumber) => parseTaskLine(line, file.path, lineNumber))
      .filter((task): task is CalendarTask => task !== null);
    this.tasksByPath.set(file.path, tasks);
    this.performanceMonitor.record("index.file", performance.now() - startedAt, {
      lines: content.split(/\r?\n/).length,
      tasks: tasks.length
    });
  }

  async replaceTask(task: CalendarTask, replacement: string): Promise<void> {
    const file = this.vault.getAbstractFileByPath(task.path);
    if (!(file instanceof TFile)) throw new Error(`Task file not found: ${task.path}`);

    await this.vault.process(file, (content) => {
      const newline = content.includes("\r\n") ? "\r\n" : "\n";
      const lines = content.split(/\r?\n/);
      const current = lines[task.line];
      if (current !== task.raw) {
        const currentIndex = lines.indexOf(task.raw);
        if (currentIndex === -1) throw new Error("The task changed before it could be updated.");
        lines.splice(currentIndex, 1, ...replacement.split(/\r?\n/));
      } else {
        lines.splice(task.line, 1, ...replacement.split(/\r?\n/));
      }
      return lines.join(newline);
    });
  }
}
