import { Events, TFile, Vault } from "obsidian";
import type { PerformanceMonitor } from "./performance";
import { parseTaskLine } from "./task-parser";
import type { CalendarTask } from "./types";

export const TASKS_CHANGED_EVENT = "tasks-calendar:changed";
const FILE_INDEX_CONCURRENCY = 8;
const FILE_INDEX_RETRY_LIMIT = 2;
const UPDATE_DEBOUNCE_MS = 120;

interface IndexFailure {
  file: TFile;
  error: unknown;
}

export class TaskStore extends Events {
  private readonly tasksByPath = new Map<string, CalendarTask[]>();
  private readonly pendingFiles = new Map<string, TFile>();
  private readonly scheduledAt = new Map<string, number>();
  private readonly retryCounts = new Map<string, number>();
  private refreshTimer: number | null = null;
  private batchRunning = false;

  constructor(
    private readonly vault: Vault,
    private readonly performanceMonitor: PerformanceMonitor,
  ) {
    super();
  }

  async initialize(): Promise<void> {
    const startedAt = performance.now();
    const files = this.vault.getMarkdownFiles();
    const failures = await this.indexFiles(files);
    if (failures.length > 0) {
      throw new AggregateError(
        failures.map(({ error }) => error),
        `Could not index ${failures.length} task file${failures.length === 1 ? "" : "s"}.`,
      );
    }
    this.performanceMonitor.record("index.initial", performance.now() - startedAt, {
      files: files.length,
      tasks: this.getTasks().length,
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
    this.retryCounts.delete(path);
    if (this.tasksByPath.delete(path)) this.trigger(TASKS_CHANGED_EVENT);
  }

  renamePath(file: TFile, oldPath: string): void {
    this.tasksByPath.delete(oldPath);
    this.pendingFiles.delete(oldPath);
    this.scheduledAt.delete(oldPath);
    this.retryCounts.delete(oldPath);
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
      tasks: tasks.length,
    });
  }

  private scheduleBatch(): void {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.flushPendingFiles().catch((error: unknown) => {
        console.error("Tasks Calendar: unexpected indexing batch failure", error);
      });
    }, UPDATE_DEBOUNCE_MS);
  }

  private async flushPendingFiles(): Promise<void> {
    if (this.batchRunning) return;
    const files = Array.from(this.pendingFiles.values());
    if (files.length === 0) return;

    this.batchRunning = true;
    const eventTimes = new Map(files.map((file) => [file.path, this.scheduledAt.get(file.path)]));
    for (const file of files) {
      this.pendingFiles.delete(file.path);
      this.scheduledAt.delete(file.path);
    }

    try {
      const failures = await this.indexFiles(files);
      const failedPaths = new Set(failures.map(({ file }) => file.path));
      for (const file of files) {
        if (!failedPaths.has(file.path)) this.retryCounts.delete(file.path);
      }
      for (const failure of failures) {
        this.handleIndexFailure(failure, eventTimes.get(failure.file.path));
      }

      if (failures.length < files.length) {
        const recordedEventTimes = Array.from(eventTimes.values()).filter(
          (value): value is number => value !== undefined,
        );
        const earliestEvent = recordedEventTimes.length > 0 ? Math.min(...recordedEventTimes) : performance.now();
        this.performanceMonitor.record("index.update-latency", performance.now() - earliestEvent, {
          files: files.length - failures.length,
        });
        this.trigger(TASKS_CHANGED_EVENT);
      }
    } finally {
      this.batchRunning = false;
      if (this.pendingFiles.size > 0) this.scheduleBatch();
    }
  }

  private handleIndexFailure(failure: IndexFailure, scheduledAt: number | undefined): void {
    const { file, error } = failure;
    console.error(`Tasks Calendar: could not index ${file.path}`, error);

    const currentFile = this.vault.getAbstractFileByPath(file.path);
    if (!(currentFile instanceof TFile)) {
      this.retryCounts.delete(file.path);
      return;
    }

    const retryCount = (this.retryCounts.get(file.path) ?? 0) + 1;
    if (retryCount > FILE_INDEX_RETRY_LIMIT) {
      this.retryCounts.delete(file.path);
      return;
    }

    this.retryCounts.set(file.path, retryCount);
    if (!this.pendingFiles.has(file.path)) this.pendingFiles.set(file.path, currentFile);
    if (!this.scheduledAt.has(file.path)) this.scheduledAt.set(file.path, scheduledAt ?? performance.now());
  }

  private async indexFiles(files: TFile[]): Promise<IndexFailure[]> {
    let nextIndex = 0;
    const failures: IndexFailure[] = [];
    const workerCount = Math.min(FILE_INDEX_CONCURRENCY, files.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (nextIndex < files.length) {
        const file = files[nextIndex];
        nextIndex += 1;
        try {
          await this.indexFile(file);
        } catch (error) {
          failures.push({ file, error });
        }
      }
    });
    await Promise.all(workers);
    return failures;
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
