import { describe, expect, it } from "vitest";
import { applyCompletionOverrides, reconcileCompletionOverrides } from "../src/tasks/completion-overrides";
import { parseTaskLine } from "../src/tasks/parser";

describe("completion overrides", () => {
  it("clears an override when a recurring task is replaced at the same source line", () => {
    const original = parseTaskLine("- [ ] Take out bins 📅 2026-07-25 🔁 every week", "Tasks.md", 4)!;
    const nextOccurrence = parseTaskLine("- [ ] Take out bins 📅 2026-08-01 🔁 every week", "Tasks.md", 4)!;
    const overrides = new Map([[original.id, { completed: true, raw: original.raw }]]);

    const reconciled = reconcileCompletionOverrides([nextOccurrence], overrides);

    expect(reconciled).toEqual(new Map());
    expect(applyCompletionOverrides([nextOccurrence], reconciled)[0].completed).toBe(false);
  });

  it("keeps an override until the source task changes", () => {
    const task = parseTaskLine("- [ ] Take out bins 📅 2026-07-25", "Tasks.md", 4)!;
    const overrides = new Map([[task.id, { completed: true, raw: task.raw }]]);

    expect(reconcileCompletionOverrides([task], overrides)).toEqual(overrides);
    expect(applyCompletionOverrides([task], overrides)[0].completed).toBe(true);
  });
});
