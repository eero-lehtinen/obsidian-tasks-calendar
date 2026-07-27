import { MarkdownRenderChild } from "obsidian";
import { StrictMode } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import type { CalendarHandle } from "./calendar-app";
import { CalendarApp } from "./calendar-app";
import { toDateKey } from "./date-utils";
import type TasksCalendarPlugin from "./main";
import type { CalendarState } from "./types";

let nextCalendarInstanceId = 0;

export class TasksCalendarRenderer extends MarkdownRenderChild {
  private readonly calendarRef = { current: null as CalendarHandle | null };
  private readonly initial: CalendarState;
  private readonly instanceId = nextCalendarInstanceId++;
  private root: Root | null = null;

  constructor(
    containerEl: HTMLElement,
    private readonly plugin: TasksCalendarPlugin,
    initial: Partial<CalendarState> = {},
    private readonly onStateChange?: (state: CalendarState) => void,
    private readonly constrainHeightToContainer = false,
  ) {
    super(containerEl);
    this.initial = {
      mode: initial.mode ?? plugin.settings.defaultView,
      anchor: initial.anchor ?? toDateKey(new Date()),
      query: initial.query ?? plugin.settings.defaultQuery,
      showCompleted: initial.showCompleted ?? plugin.settings.showCompleted,
      search: initial.search ?? "",
      dayHeight: initial.dayHeight ?? null,
      monthHeight: initial.monthHeight ?? null,
      weekHeight: initial.weekHeight ?? null,
    };
  }

  override onload(): void {
    this.containerEl.addClass("tasks-calendar");
    this.root = createRoot(this.containerEl);
    this.registerEvent(this.plugin.taskStore.on("tasks-calendar:changed", () => this.calendarRef.current?.refresh()));
    this.root.render(
      <StrictMode>
        <CalendarApp
          initial={this.initial}
          instanceId={this.instanceId}
          {...(this.onStateChange ? { onStateChange: this.onStateChange } : {})}
          plugin={this.plugin}
          constrainHeightToContainer={this.constrainHeightToContainer}
          ref={this.calendarRef}
        />
      </StrictMode>,
    );
  }

  override onunload(): void {
    this.root?.unmount();
    this.root = null;
    this.containerEl.removeClass("tasks-calendar");
  }

  refresh(): void {
    this.calendarRef.current?.refresh();
  }

  getState(): CalendarState {
    return this.calendarRef.current?.getState() ?? { ...this.initial };
  }

  setState(state: Partial<CalendarState>): void {
    this.calendarRef.current?.setState(state);
  }
}
