import { describe, expect, it } from "vitest";
import { createCalendarModel } from "../src/calendar-model";
import { parseTaskLine } from "../src/task-parser";
import type { CalendarState, TasksCalendarSettings } from "../src/types";

const settings: Pick<TasksCalendarSettings, "datePreference" | "undatedTasks" | "weekStartsOn"> = {
  datePreference: ["scheduled", "due", "start"],
  undatedTasks: "hide",
  weekStartsOn: 1,
};

const state: CalendarState = {
  anchor: "2026-07-24",
  mode: "month",
  query: "",
  search: "",
  selectedDate: null,
  showCompleted: false,
  monthHeight: null,
  weekHeight: null,
};

describe("createCalendarModel", () => {
  it("groups visible tasks and separates tasks before the current view", () => {
    const tasks = [
      parseTaskLine("- [ ] In range ⏳ 2026-07-24", "Tasks.md", 0)!,
      parseTaskLine("- [ ] Very late ⏳ 2026-06-01", "Tasks.md", 1)!,
      parseTaskLine("- [x] Completed ⏳ 2026-07-24", "Tasks.md", 2)!,
    ];

    const model = createCalendarModel(tasks, state, settings, new Date(2026, 6, 24), new Date(2026, 6, 24));

    expect(model.tasksByDate.get("2026-07-24")?.map((task) => task.description)).toEqual(["In range"]);
    expect(model.lateTasks.map((task) => task.description)).toEqual(["Very late"]);
    expect(model.visibleTasks).toBe(2);
  });

  it("returns no tasks when the query is invalid", () => {
    const tasks = [parseTaskLine("- [ ] In range ⏳ 2026-07-24", "Tasks.md", 0)!];
    const model = createCalendarModel(
      tasks,
      { ...state, query: "unsupported instruction" },
      settings,
      new Date(2026, 6, 24),
      new Date(2026, 6, 24),
    );

    expect(model.queryError).toContain("Unsupported filter");
    expect(model.tasksByDate.size).toBe(0);
  });
});
