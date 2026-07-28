import { describe, expect, it } from "vitest";
import { orderCalendarTasks, reorderTaskGroup, taskOrderKey, withoutTaskOrderKey } from "../src/tasks/order";
import { parseTaskLine } from "../src/tasks/parser";

const alpha = parseTaskLine("- [ ] Alpha 📅 2026-07-24", "Tasks.md", 1)!;
const beta = parseTaskLine("- [ ] Beta 📅 2026-07-24", "Tasks.md", 2)!;
const gamma = parseTaskLine("- [ ] Gamma 📅 2026-07-24", "Tasks.md", 3)!;

describe("orderCalendarTasks", () => {
  it("applies a saved visual order before the default ordering", () => {
    expect(
      orderCalendarTasks([alpha, beta, gamma], [taskOrderKey(alpha), taskOrderKey(gamma)]).map((task) => task.id),
    ).toEqual([alpha.id, gamma.id, beta.id]);
  });

  it("uses the default order when no visual order exists", () => {
    expect(orderCalendarTasks([alpha, beta, gamma]).map((task) => task.id)).toEqual([gamma.id, beta.id, alpha.id]);
  });

  it("keeps completed tasks below active tasks regardless of saved order", () => {
    const completed = parseTaskLine("- [x] Completed 📅 2026-07-24", "Tasks.md", 4)!;

    expect(
      orderCalendarTasks([completed, alpha], [taskOrderKey(completed), taskOrderKey(alpha)]).map(
        (task) => task.description,
      ),
    ).toEqual(["Alpha", "Completed"]);
  });
});

describe("withoutTaskOrderKey", () => {
  it("forgets a task's ordering on every date and removes empty entries", () => {
    expect(
      withoutTaskOrderKey(
        {
          "2026-07-24": [alpha.id, beta.id],
          "2026-07-25": [alpha.id],
          "2026-07-26": [gamma.id],
        },
        alpha.id,
      ),
    ).toEqual({
      "2026-07-24": [beta.id],
      "2026-07-26": [gamma.id],
    });
  });
});

describe("reorderTaskGroup", () => {
  const completed = parseTaskLine("- [x] Completed 📅 2026-07-24", "Tasks.md", 4)!;

  it("reorders within a completion group and preserves the group boundary", () => {
    expect(reorderTaskGroup([alpha, beta, completed], alpha.id, beta.id)?.map((task) => task.description)).toEqual([
      "Beta",
      "Alpha",
      "Completed",
    ]);
  });

  it("rejects a target in the other completion group", () => {
    expect(reorderTaskGroup([alpha, completed], alpha.id, completed.id)).toBeNull();
  });
});
