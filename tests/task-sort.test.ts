import { describe, expect, it } from "vitest";
import { compareCalendarTasks } from "../src/task-sort";
import { parseTaskLine } from "../src/task-parser";

describe("compareCalendarTasks", () => {
  it("orders otherwise-equal tasks from bottom to top within a file", () => {
    const upper = parseTaskLine("- [ ] Alpha 📅 2026-07-24", "Tasks.md", 4)!;
    const lower = parseTaskLine("- [ ] Zulu 📅 2026-07-24", "Tasks.md", 20)!;
    expect([upper, lower].sort(compareCalendarTasks)).toEqual([lower, upper]);
  });

  it("keeps completion and priority ahead of source position", () => {
    const completed = parseTaskLine("- [x] Completed ⏫ 📅 2026-07-24", "Tasks.md", 20)!;
    const active = parseTaskLine("- [ ] Active 🔽 📅 2026-07-24", "Tasks.md", 4)!;
    expect([completed, active].sort(compareCalendarTasks)).toEqual([active, completed]);
  });
});
