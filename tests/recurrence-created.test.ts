import { describe, expect, it } from "vitest";
import { capturePendingRecurrence, findCreatedRecurrence } from "../src/recurrence-created";
import { parseTaskLine } from "../src/task-parser";

describe("recurrence creation detection", () => {
  it("finds the newly generated unchecked occurrence", () => {
    const current = parseTaskLine("- [ ] Take out bins 📅 2026-07-25 🔁 every week", "Tasks.md", 4)!;
    const unrelatedCopy = parseTaskLine("- [ ] Take out bins 📅 2026-07-25 🔁 every week", "Tasks.md", 8)!;
    const pending = capturePendingRecurrence(current, [current, unrelatedCopy])!;
    const completed = parseTaskLine("- [x] Take out bins 📅 2026-07-25 🔁 every week ✅ 2026-07-25", "Tasks.md", 4)!;
    const next = parseTaskLine("- [ ] Take out bins 📅 2026-08-01 🔁 every week", "Tasks.md", 5)!;

    expect(findCreatedRecurrence([completed, unrelatedCopy, next], pending)).toBe(next);
  });

  it("ignores existing matching tasks and non-recurring completions", () => {
    const recurring = parseTaskLine("- [ ] Take out bins 📅 2026-07-25 🔁 every week", "Tasks.md", 4)!;
    const regular = parseTaskLine("- [ ] Take out bins 📅 2026-07-25", "Tasks.md", 5)!;
    const pending = capturePendingRecurrence(recurring, [recurring])!;

    expect(findCreatedRecurrence([recurring], pending)).toBeNull();
    expect(capturePendingRecurrence(regular, [regular])).toBeNull();
  });
});
