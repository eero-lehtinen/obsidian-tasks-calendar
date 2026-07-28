import { ItemView, type WorkspaceLeaf } from "obsidian";
import type TasksCalendarPlugin from "../main";
import type { CalendarState } from "../types";
import { TasksCalendarRenderer } from "./calendar";

export const TASKS_CALENDAR_VIEW = "tasks-calendar-view";

export class TasksCalendarView extends ItemView {
  private renderer: TasksCalendarRenderer | null = null;
  private pendingState: Partial<CalendarState> = {};

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: TasksCalendarPlugin,
  ) {
    super(leaf);
  }

  override getViewType(): string {
    return TASKS_CALENDAR_VIEW;
  }

  override getDisplayText(): string {
    return "Tasks Calendar";
  }

  override getIcon(): string {
    return "calendar-check";
  }

  override async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("tasks-calendar-view");
    this.renderer = new TasksCalendarRenderer(
      this.contentEl,
      this.plugin,
      { ...(this.plugin.settings.lastViewState ?? {}), ...this.pendingState },
      (state) => {
        this.plugin.rememberCalendarState(state);
        this.app.workspace.requestSaveLayout();
      },
      true,
    );
    this.addChild(this.renderer);
  }

  override async onClose(): Promise<void> {
    this.renderer = null;
  }

  override getState(): Record<string, unknown> {
    return (this.renderer?.getState() as unknown as Record<string, unknown>) ?? {};
  }

  override async setState(state: Partial<CalendarState>): Promise<void> {
    this.pendingState = state;
    this.renderer?.setState(state);
  }

  refresh(): void {
    this.renderer?.refresh();
  }
}
