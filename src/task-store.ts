import { Events, TFile, Vault } from "obsidian";
import type { PerformanceMonitor } from "./performance";
import { parseTaskLine } from "./task-parser";
import type { CalendarTask } from "./types";

export const TASKS_CHANGED_EVENT = "tasks-calendar:changed";
const FILE_INDEX_CONCURRENCY = 8;
const UPDATE_DEBOUNCE_MS = 120;

export class TaskStore extends Events {
  private readonly tasksByPath = new Map<string, CalendarTask[]>();
  private readonly pendingFiles = new Map<string, TFile>();
  private readonly scheduledAt = new Map<string, number>();
  private refreshTimer: number | null = null;
  private batchRunning = false;

  constructor(
    private readonly vault: Vault,
    private readonly performanceMonitor: PerformanceMonitor
  ) {
    super();
  }

  async initialize(): Promise<void> {
    const startedAt = performance.now();
    const files = this.vault.getMarkdownFiles();
    await this.indexFiles(files);
    this.performanceMonitor.record("index.initial", performance.now() - startedAt, {
      files: files.length,
      tasks: this.getTasks().length
    });
  }

  getTasks(): CalendarTask[] {
    return Array.from(this.tasksByPath.values()).flat();
  }

  scheduleFile(file: TFile): void {
    this.pendingFiles.set(file.path, file);
    if (!this.scheduledAt.has(file.path)) this.scheduledAt.set(file.path, performance.now());
    this.scheduleBatch();
  }

  removePath(path: string): void {
    this.pendingFiles.delete(path);
    this.scheduledAt.delete(path);
    if (this.tasksByPath.delete(path)) this.trigger(TASKS_CHANGED_EVENT);
  }

  renamePath(file: TFile, oldPath: string): void {
    this.tasksByPath.delete(oldPath);
    this.pendingFiles.delete(oldPath);
    this.scheduledAt.delete(oldPath);
    this.scheduleFile(file);
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

  private scheduleBatch(): void {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.flushPendingFiles();
    }, UPDATE_DEBOUNCE_MS);
  }

  private async flushPendingFiles(): Promise<void> {
    if (this.batchRunning) return;
    const files = Array.from(this.pendingFiles.values());
    if (files.length === 0) return;

    this.batchRunning = true;
    const eventTimes = files
      .map((file) => this.scheduledAt.get(file.path))
      .filter((value): value is number => value !== undefined);
    for (const file of files) {
      this.pendingFiles.delete(file.path);
      this.scheduledAt.delete(file.path);
    }

    try {
      await this.indexFiles(files);
      const earliestEvent = eventTimes.length > 0 ? Math.min(...eventTimes) : performance.now();
      this.performanceMonitor.record("index.update-latency", performance.now() - earliestEvent, {
        files: files.length
      });
      this.trigger(TASKS_CHANGED_EVENT);
    } finally {
      this.batchRunning = false;
      if (this.pendingFiles.size > 0) this.scheduleBatch();
    }
  }

  private async indexFiles(files: TFile[]): Promise<void> {
    let nextIndex = 0;
    const workerCount = Math.min(FILE_INDEX_CONCURRENCY, files.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (nextIndex < files.length) {
        const file = files[nextIndex];
        nextIndex += 1;
        await this.indexFile(file);
      }
    });
    await Promise.all(workers);
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
