import { Platform, setIcon } from "obsidian";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { fromDateKey, titleForRange } from "./date-utils";
import type TasksCalendarPlugin from "./main";
import type { CalendarMode, CalendarState } from "./types";

export type CalendarStateUpdate = (state: Partial<CalendarState>) => void;

export function CalendarToolbar({
  onNavigate,
  onQueryToggle,
  onToday,
  plugin,
  state,
  updateState,
}: {
  onNavigate: (direction: -1 | 1) => void;
  onQueryToggle: () => void;
  onToday: () => void;
  plugin: TasksCalendarPlugin;
  state: CalendarState;
  updateState: CalendarStateUpdate;
}) {
  return (
    <div className="tasks-calendar-toolbar">
      <div className="tasks-calendar-navigation">
        <button className="tasks-calendar-today-button" onClick={onToday} type="button">
          Today
        </button>
        <IconButton icon="chevron-left" label="Previous" onClick={() => onNavigate(-1)} />
        <IconButton icon="chevron-right" label="Next" onClick={() => onNavigate(1)} />
      </div>
      <h2 className="tasks-calendar-title">
        {titleForRange(fromDateKey(state.anchor), state.mode, plugin.settings.weekStartsOn)}
      </h2>
      <div className="tasks-calendar-controls">
        <input
          aria-label="Search tasks"
          className="tasks-calendar-search"
          onChange={(event) => updateState({ search: event.target.value })}
          placeholder="Search tasks"
          type="search"
          value={state.search}
        />
        <IconButton
          active={Boolean(state.query.trim())}
          icon="list-filter"
          label="Edit task filters"
          onClick={onQueryToggle}
        />
        <IconButton
          icon={state.showCompleted ? "eye" : "eye-off"}
          label={state.showCompleted ? "Hide completed tasks" : "Show completed tasks"}
          onClick={() => updateState({ showCompleted: !state.showCompleted })}
        />
        <div className="tasks-calendar-mode-switch">
          <ModeButton mode="month" state={state} updateState={updateState}>
            Month
          </ModeButton>
          <ModeButton mode="week" state={state} updateState={updateState}>
            Week
          </ModeButton>
        </div>
      </div>
    </div>
  );
}

export function QueryEditor({ state, updateState }: { state: CalendarState; updateState: CalendarStateUpdate }) {
  return (
    <div className="tasks-calendar-query-panel">
      <label>
        Task filters
        <span>One Tasks-style instruction per line</span>
      </label>
      <textarea
        className="tasks-calendar-query"
        onChange={(event) => updateState({ query: event.target.value })}
        placeholder={"not done\npath includes Projects\nscheduled before tomorrow"}
        rows={3}
        value={state.query}
      />
      <a
        className="tasks-calendar-query-help"
        href="https://publish.obsidian.md/tasks/Queries/Filters"
        rel="noreferrer"
        target="_blank"
      >
        Tasks query reference
      </a>
    </div>
  );
}

function IconButton({
  active = false,
  icon,
  label,
  onClick,
}: {
  active?: boolean;
  icon: string;
  label: string;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (ref.current) setIcon(ref.current, icon);
  }, [icon]);

  return (
    <button
      aria-label={label}
      className={`clickable-icon${active ? " is-active" : ""}`}
      data-tooltip-position={Platform.isMobile ? undefined : "top"}
      onClick={onClick}
      ref={ref}
      type="button"
    />
  );
}

function ModeButton({
  children,
  mode,
  state,
  updateState,
}: {
  children: ReactNode;
  mode: CalendarMode;
  state: CalendarState;
  updateState: CalendarStateUpdate;
}) {
  return (
    <button className={state.mode === mode ? "is-active" : ""} onClick={() => updateState({ mode })} type="button">
      {children}
    </button>
  );
}
