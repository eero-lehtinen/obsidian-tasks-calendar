import { describe, expect, it } from "vitest";
import { EditorHistory } from "../src/tasks/editor-history";

describe("editor undo history", () => {
  it("undoes and redoes edits across fields in order", () => {
    const initial = { description: "Task", due: "", priority: "normal", completed: false };
    const dated = { ...initial, due: "2026-11-04" };
    const prioritized = { ...dated, priority: "high" };
    const completed = { ...prioritized, completed: true };
    const history = new EditorHistory(initial);
    history.record(dated);
    history.record(prioritized);
    history.record(completed);
    expect(history.undo()).toEqual(prioritized);
    expect(history.undo()).toEqual(dated);
    expect(history.undo()).toEqual(initial);
    expect(history.redo()).toEqual(dated);
    expect(history.redo()).toEqual(prioritized);
    expect(history.redo()).toEqual(completed);
  });

  it("groups consecutive typing in the same field", () => {
    const history = new EditorHistory("");
    history.record("T", "description", 100);
    history.record("Ta", "description", 200);
    history.record("Task", "description", 300);
    expect(history.undo()).toBe("");
    expect(history.redo()).toBe("Task");
  });

  it("separates edits after a pause or a field change", () => {
    const history = new EditorHistory("");
    history.record("a", "description", 100);
    history.record("ab", "description", 1000);
    history.record("abc", "recurrence", 1100);
    expect(history.undo()).toBe("ab");
    expect(history.undo()).toBe("a");
  });

  it("does not merge typing after focus changes", () => {
    const history = new EditorHistory("");
    history.record("a", "description", 100);
    history.breakGroup();
    history.record("ab", "description", 200);
    expect(history.undo()).toBe("a");
  });

  it("ignores duplicate input and change events", () => {
    const history = new EditorHistory({ value: "" });
    history.record({ value: "a" }, "description", 100);
    history.record({ value: "a" });
    history.record({ value: "ab" }, "description", 200);
    expect(history.undo()).toEqual({ value: "" });
    expect(history.undo()).toBeUndefined();
  });

  it("discards redo after a new edit", () => {
    const history = new EditorHistory("");
    history.record("a", "description", 100);
    history.undo();
    history.record("b", "description", 200);
    expect(history.redo()).toBeUndefined();
    expect(history.undo()).toBe("");
  });

  it("does not merge typing with a redone edit", () => {
    const history = new EditorHistory("");
    history.record("a", "description", 100);
    history.undo();
    history.redo();
    history.record("ab", "description", 200);
    expect(history.undo()).toBe("a");
  });

  it("restores the caret before an edit and after redo", () => {
    const history = new EditorHistory({ text: "Task", start: 4, end: 4 }, (a, b) => a.text === b.text);
    history.updateCurrent({ text: "Task", start: 1, end: 1 });
    history.record({ text: "Taask", start: 2, end: 2 }, "description", 100);
    expect(history.undo()).toEqual({ text: "Task", start: 1, end: 1 });
    expect(history.redo()).toEqual({ text: "Taask", start: 2, end: 2 });
  });

  it("restores a selection replaced by grouped typing", () => {
    const history = new EditorHistory({ text: "Write docs", start: 0, end: 0 }, (a, b) => a.text === b.text);
    history.updateCurrent({ text: "Write docs", start: 6, end: 10 });
    history.record({ text: "Write a", start: 7, end: 7 }, "description", 100);
    history.updateCurrent({ text: "Write a", start: 7, end: 7 });
    history.record({ text: "Write api", start: 9, end: 9 }, "description", 200);
    expect(history.undo()).toEqual({ text: "Write docs", start: 6, end: 10 });
    expect(history.redo()).toEqual({ text: "Write api", start: 9, end: 9 });
  });

  it("does not create an undo step or clear redo when the caret moves", () => {
    const history = new EditorHistory({ text: "a", caret: 1 }, (a, b) => a.text === b.text);
    history.record({ text: "ab", caret: 2 });
    history.undo();
    history.updateCurrent({ text: "a", caret: 0 });
    expect(history.redo()).toEqual({ text: "ab", caret: 2 });
    expect(history.undo()).toEqual({ text: "a", caret: 0 });
    expect(history.undo()).toBeUndefined();
  });
});
