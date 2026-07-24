import { ItemView, WorkspaceLeaf } from "obsidian";
import { TasksCalendarRenderer } from "./calendar";
import type TasksCalendarPlugin from "./main";
import type { CalendarState } from "./types";

export const TASKS_CALENDAR_VIEW = "tasks-calendar-view";

export class TasksCalendarView extends ItemView {
  private renderer: TasksCalendarRenderer | null = null;
  private pendingState: Partial<CalendarState> = {};

  constructor(leaf: WorkspaceLeaf, private readonly plugin: TasksCalendarPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return TASKS_CALENDAR_VIEW;
  }

  getDisplayText(): string {
    return "Tasks Calendar";
  }

  getIcon(): string {
    return "calendar-check";
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("tasks-calendar-view");
    this.renderer = new TasksCalendarRenderer(this.contentEl, this.plugin, this.pendingState);
    this.addChild(this.renderer);
  }

  async onClose(): Promise<void> {
    this.renderer = null;
  }

  getState(): Record<string, unknown> {
    return this.renderer?.getState() as unknown as Record<string, unknown> ?? {};
  }

  async setState(state: Partial<CalendarState>): Promise<void> {
    this.pendingState = state;
    this.renderer?.setState(state);
  }

  refresh(): void {
    this.renderer?.refresh();
  }
}
