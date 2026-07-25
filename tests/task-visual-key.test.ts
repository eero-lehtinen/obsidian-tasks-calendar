import { describe, expect, it } from "vitest";
import { parseTaskLine } from "../src/task-parser";
import { taskVisualKey } from "../src/task-visual-key";

describe("taskVisualKey", () => {
  it("survives completion and source line shifts", () => {
    const pending = parseTaskLine("- [ ] Take out bins 📅 2026-07-25 🔁 every week", "Tasks.md", 4)!;
    const completed = parseTaskLine("- [x] Take out bins 📅 2026-07-25 🔁 every week ✅ 2026-07-25", "Tasks.md", 7)!;

    expect(taskVisualKey(completed)).toBe(taskVisualKey(pending));
  });

  it("distinguishes the next recurring occurrence", () => {
    const current = parseTaskLine("- [ ] Take out bins 📅 2026-07-25 🔁 every week", "Tasks.md", 4)!;
    const next = parseTaskLine("- [ ] Take out bins 📅 2026-08-01 🔁 every week", "Tasks.md", 5)!;

    expect(taskVisualKey(next)).not.toBe(taskVisualKey(current));
  });

  it("uses an explicit block ID across task edits", () => {
    const pending = parseTaskLine("- [ ] Take out bins 📅 2026-07-25 ^bins", "Tasks.md", 4)!;
    const completed = parseTaskLine("- [x] Take out bins 📅 2026-07-25 ✅ 2026-07-25 ^bins", "Tasks.md", 7)!;

    expect(taskVisualKey(completed)).toBe(taskVisualKey(pending));
  });
});
