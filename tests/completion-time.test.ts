import { describe, expect, it } from "vitest";
import {
  addCompletionTime,
  addCompletionTimeToCompletedLine,
  removeCompletionTime,
} from "../src/tasks/completion-time";

describe("completion time", () => {
  it("places the time before every Tasks metadata field", () => {
    expect(addCompletionTime("- [x] Write report ✅ 2026-08-30", "14:32")).toBe(
      "- [x] Write report 🕒 14:32 ✅ 2026-08-30",
    );
    expect(addCompletionTime("- [x] Write report ⏫ 🔁 every day 📅 2026-08-30 ✅ 2026-08-30", "14:32")).toBe(
      "- [x] Write report 🕒 14:32 ⏫ 🔁 every day 📅 2026-08-30 ✅ 2026-08-30",
    );
  });

  it("places the completion time before a block link", () => {
    expect(addCompletionTime("- [x] Write report ^report", "14:32")).toBe("- [x] Write report 🕒 14:32 ^report");
  });

  it("does not add a duplicate completion time", () => {
    expect(addCompletionTime("- [x] Write report 🕒 14:32", "15:00")).toBe("- [x] Write report 🕒 14:32");
  });

  it("adds the time to the completed line in recurring output", () => {
    const replacement =
      "- [ ] Write report 🔁 every day 📅 2026-08-31\n- [x] Write report 🔁 every day 📅 2026-08-30 ✅ 2026-08-30";

    expect(addCompletionTimeToCompletedLine(replacement, "14:32")).toBe(
      "- [ ] Write report 🔁 every day 📅 2026-08-31\n- [x] Write report 🕒 14:32 🔁 every day 📅 2026-08-30 ✅ 2026-08-30",
    );
  });

  it("leaves output unchanged when no task was completed", () => {
    const replacement = "- [ ] Write report";
    expect(addCompletionTimeToCompletedLine(replacement, "14:32")).toBe(replacement);
  });

  it("removes the completion time when a task is reopened", () => {
    expect(removeCompletionTime("- [ ] Write report 🕒 14:32 ✅ 2026-08-30")).toBe("- [ ] Write report ✅ 2026-08-30");
  });
});
