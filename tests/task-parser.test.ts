import { describe, expect, it } from "vitest";
import { fallbackToggleLine, parseTaskLine, rescheduleTaskLine } from "../src/tasks/task-parser";

describe("parseTaskLine", () => {
  it("parses Tasks emoji fields", () => {
    const task = parseTaskLine(
      "- [ ] Ship release #work ⏫ 🔁 every week ⏳ 2026-07-24 📅 2026-07-25",
      "Project.md",
      4,
    );
    expect(task).toMatchObject({
      path: "Project.md",
      line: 4,
      description: "Ship release #work ⏫",
      tags: ["#work"],
      priority: "high",
      recurrence: "every week",
      scheduled: "2026-07-24",
      due: "2026-07-25",
      completed: false,
    });
  });

  it("recognizes completed custom statuses", () => {
    expect(parseTaskLine("* [X] Finished ✅ 2026-07-24", "Done.md", 0)?.completed).toBe(true);
  });
});

describe("fallbackToggleLine", () => {
  it("preserves indentation and content", () => {
    expect(fallbackToggleLine("  - [ ] Keep everything 📅 2026-07-24")).toBe("  - [x] Keep everything 📅 2026-07-24");
  });
});

describe("rescheduleTaskLine", () => {
  it("updates the selected existing date field", () => {
    expect(rescheduleTaskLine("- [ ] Prepare report ⏳ 2026-07-20 📅 2026-07-25", "scheduled", "2026-07-28")).toBe(
      "- [ ] Prepare report ⏳ 2026-07-28 📅 2026-07-25",
    );
  });

  it("adds a missing field before a block link", () => {
    expect(rescheduleTaskLine("- [ ] Prepare report ^report", "scheduled", "2026-07-28")).toBe(
      "- [ ] Prepare report ⏳ 2026-07-28 ^report",
    );
  });
});
