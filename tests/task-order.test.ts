import { describe, expect, it } from "vitest";
import {
  orderCalendarTasks,
  reorderTaskGroup,
  taskOrderKey,
  withoutTaskOrderDate,
  withoutTaskOrderKey,
} from "../src/tasks/order";
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

  it("keeps a new higher-priority task above a manually reordered priority group", () => {
    const high = parseTaskLine("- [ ] High ⏫ 📅 2026-07-24", "Tasks.md", 4)!;

    expect(
      orderCalendarTasks([alpha, beta, high], [taskOrderKey(alpha), taskOrderKey(beta)]).map(
        (task) => task.description,
      ),
    ).toEqual(["High ⏫", "Alpha", "Beta"]);
  });

  it("preserves an explicit manual order across priority groups", () => {
    const high = parseTaskLine("- [ ] High ⏫ 📅 2026-07-24", "Tasks.md", 4)!;

    expect(
      orderCalendarTasks([alpha, high], [taskOrderKey(alpha), taskOrderKey(high)]).map((task) => task.description),
    ).toEqual(["Alpha", "High ⏫"]);
  });

  it("inserts a new task after the last higher priority when existing priorities are overridden", () => {
    const high = parseTaskLine("- [ ] High ⏫ 📅 2026-07-24", "Tasks.md", 4)!;
    const medium = parseTaskLine("- [ ] Medium 🔼 📅 2026-07-24", "Tasks.md", 5)!;

    expect(
      orderCalendarTasks([alpha, high, medium], [taskOrderKey(alpha), taskOrderKey(high)]).map(
        (task) => task.description,
      ),
    ).toEqual(["Alpha", "High ⏫", "Medium 🔼"]);
  });

  it("inserts a new task after its priority group when priorities have been manually overridden", () => {
    const high = parseTaskLine("- [ ] High ⏫ 📅 2026-07-24", "Tasks.md", 4)!;
    const otherHigh = parseTaskLine("- [ ] Other high ⏫ 📅 2026-07-24", "Tasks.md", 5)!;

    expect(
      orderCalendarTasks([alpha, high, otherHigh], [taskOrderKey(alpha), taskOrderKey(high)]).map(
        (task) => task.description,
      ),
    ).toEqual(["Alpha", "High ⏫", "Other high ⏫"]);
  });

  it("inserts a new task above all tasks when only lower priorities exist", () => {
    const high = parseTaskLine("- [ ] High ⏫ 📅 2026-07-24", "Tasks.md", 4)!;
    const low = parseTaskLine("- [ ] Low 🔽 📅 2026-07-24", "Tasks.md", 5)!;

    expect(
      orderCalendarTasks([alpha, low, high], [taskOrderKey(low), taskOrderKey(alpha)]).map((task) => task.description),
    ).toEqual(["High ⏫", "Low 🔽", "Alpha"]);
  });

  it("inserts a new task below all tasks when only higher priorities exist", () => {
    const high = parseTaskLine("- [ ] High ⏫ 📅 2026-07-24", "Tasks.md", 4)!;
    const highest = parseTaskLine("- [ ] Highest 🔺 📅 2026-07-24", "Tasks.md", 5)!;
    const low = parseTaskLine("- [ ] Low 🔽 📅 2026-07-24", "Tasks.md", 6)!;

    expect(
      orderCalendarTasks([high, highest, low], [taskOrderKey(high), taskOrderKey(highest)]).map(
        (task) => task.description,
      ),
    ).toEqual(["High ⏫", "Highest 🔺", "Low 🔽"]);
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

describe("withoutTaskOrderDate", () => {
  it("removes the selected date without changing other saved orders", () => {
    expect(
      withoutTaskOrderDate(
        {
          "2026-08-04": ["one", "two"],
          "2026-08-05": ["three", "four"],
        },
        "2026-08-04",
      ),
    ).toEqual({ "2026-08-05": ["three", "four"] });
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
