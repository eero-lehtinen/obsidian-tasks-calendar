import { describe, expect, it } from "vitest";
import {
  parseTaskDate,
  taskEditorModelFromLine,
  taskLineFromEditorModel,
  validateRecurrence,
} from "../src/tasks/task-editor-model";

describe("task editor model", () => {
  it("extracts editable fields and preserves unsupported metadata", () => {
    const model = taskEditorModelFromLine(
      "  - [/] Write docs ⏫ 🔁 every week on Monday 🛫 2026-08-16 📅 2026-08-17 🆔 docs ^write-docs  ",
    );

    expect(model).toMatchObject({
      prefix: "  - ",
      status: "/",
      description: "Write docs",
      priority: "high",
      recurrence: "every week on Monday",
      due: "2026-08-17",
      preservedMetadata: ["🛫 2026-08-16", "🆔 docs"],
      blockLink: "^write-docs",
      hasOtherRecurrenceDate: true,
    });

    model.description = "Publish docs";
    model.priority = "low";
    model.due = "2026-08-20";
    expect(taskLineFromEditorModel(model)).toBe(
      "  - [/] Publish docs 🔽 🔁 every week on Monday 📅 2026-08-20 🛫 2026-08-16 🆔 docs ^write-docs  ",
    );
  });

  it("parses natural language dates with future-date semantics", () => {
    const monday = new Date(2026, 7, 17, 12);
    expect(parseTaskDate("thu", true, monday)).toEqual({ dateKey: "2026-08-20", error: null });
    expect(parseTaskDate("2026-02-30", true, monday).error).not.toBeNull();
    expect(parseTaskDate("", true, monday)).toEqual({ dateKey: null, error: null });
  });

  it("validates recurrence syntax and requires a date anchor", () => {
    expect(validateRecurrence("every week on Monday", true)).toEqual({
      normalized: "every week on Monday",
      error: null,
    });
    expect(validateRecurrence("every week when done", false).error).toContain("required");
    expect(validateRecurrence("sometimes perhaps", true).error).toBe("Invalid recurrence rule.");
  });
});
