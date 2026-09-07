import type { RefObject } from "react";
import { useLayoutEffect, useRef } from "react";
import type { CalendarState } from "../types";
import type { MonthCellLayout } from "./layout";
import { CalendarLayoutController } from "./layout";
import type { CalendarStateUpdate } from "./toolbar";

export function useCalendarLayout({
  constrainHeightToContainer,
  contentRef,
  gridRef,
  model,
  queryOpen,
  state,
  updateState,
}: {
  constrainHeightToContainer: boolean;
  contentRef: RefObject<HTMLDivElement | null>;
  gridRef: RefObject<HTMLDivElement | null>;
  model: unknown;
  queryOpen: boolean;
  state: CalendarState;
  updateState: CalendarStateUpdate;
}): void {
  const layoutRef = useRef(new CalendarLayoutController());
  const { dayHeight, mode, monthHeight, weekHeight } = state;

  useLayoutEffect(() => {
    // Both values change the rendered grid dimensions even though measurement only reads the DOM.
    void model;
    void queryOpen;
    const layout = layoutRef.current;
    const grid = gridRef.current;
    const content = contentRef.current;
    if (!grid || !content) return;
    layout.reset();

    const heightKey = mode === "day" ? "dayHeight" : mode === "week" ? "weekHeight" : "monthHeight";
    const desiredHeight = mode === "day" ? dayHeight : mode === "week" ? weekHeight : monthHeight;
    layout.observeHeight(
      content,
      desiredHeight,
      (height) => {
        if (height !== desiredHeight) updateState({ [heightKey]: height });
      },
      constrainHeightToContainer
        ? () =>
            Math.max(
              0,
              (content.parentElement?.getBoundingClientRect().bottom ?? 0) - content.getBoundingClientRect().top,
            )
        : null,
    );

    if (mode === "month") {
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
    contentRef,
    dayHeight,
    gridRef,
    model,
    mode,
    monthHeight,
    queryOpen,
    updateState,
    weekHeight,
  ]);
}
