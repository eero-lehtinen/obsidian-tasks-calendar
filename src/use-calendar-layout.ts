import { useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import { CalendarLayoutController } from "./calendar-layout";
import type { MonthCellLayout } from "./calendar-layout";
import type { CalendarState } from "./types";
import type { CalendarStateUpdate } from "./calendar-toolbar";

export function useCalendarLayout({
  constrainHeightToContainer,
  gridRef,
  model,
  queryOpen,
  state,
  updateState,
}: {
  constrainHeightToContainer: boolean;
  gridRef: RefObject<HTMLDivElement | null>;
  model: unknown;
  queryOpen: boolean;
  state: CalendarState;
  updateState: CalendarStateUpdate;
}): void {
  const layoutRef = useRef(new CalendarLayoutController());

  useLayoutEffect(() => {
    const layout = layoutRef.current;
    const grid = gridRef.current;
    if (!grid) return;
    layout.reset();

    const heightKey = state.mode === "week" ? "weekHeight" : "monthHeight";
    const desiredHeight = state[heightKey];
    layout.observeHeight(
      grid,
      desiredHeight,
      (height) => {
        if (height !== desiredHeight) updateState({ [heightKey]: height });
      },
      constrainHeightToContainer
        ? () =>
            Math.max(0, (grid.parentElement?.getBoundingClientRect().bottom ?? 0) - grid.getBoundingClientRect().top)
        : null,
    );

    if (state.mode === "month") {
      const layouts = Array.from(grid.querySelectorAll<HTMLElement>(".tasks-calendar-day"))
        .map((cell): MonthCellLayout | null => {
          const list = cell.querySelector<HTMLElement>(".tasks-calendar-task-list");
          const moreButton = cell.querySelector<HTMLButtonElement>(".tasks-calendar-more");
          if (!list || !moreButton) return null;
          return {
            cell,
            moreButton,
            taskElements: Array.from(list.querySelectorAll<HTMLElement>(":scope > .tasks-calendar-task")),
          };
        })
        .filter((value): value is MonthCellLayout => value !== null);
      layout.observeMonth(grid, layouts);
    }
    return () => layout.reset();
  }, [
    constrainHeightToContainer,
    gridRef,
    model,
    queryOpen,
    state.mode,
    state.monthHeight,
    state.weekHeight,
    updateState,
  ]);
}
