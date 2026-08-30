import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { createCompletionTimeTransactionFilter } from "../src/tasks/completion-time-transaction-filter";

describe("completion time transaction filter", () => {
  it("adds a time in the same transaction that completes a task", () => {
    const state = createState("- [ ] Write report ✅ 2026-08-30");
    const transaction = replaceDocument(state, "- [x] Write report ✅ 2026-08-30");

    expect(transaction.newDoc.toString()).toBe("- [x] Write report ✅ 2026-08-30 🕒 14:32");
  });

  it("handles a transaction that changes only the checkbox character", () => {
    const state = createState("- [ ] Write report");
    const transaction = state.update({ changes: { from: 3, to: 4, insert: "x" } });

    expect(transaction.newDoc.toString()).toBe("- [x] Write report 🕒 14:32");
  });

  it("removes the time in the same transaction that reopens a task", () => {
    const state = createState("- [x] Write report 🕒 14:32 ✅ 2026-08-30");
    const transaction = replaceDocument(state, "- [ ] Write report");

    expect(transaction.newDoc.toString()).toBe("- [ ] Write report");
  });

  it("adds the time to the completed occurrence of a recurring task", () => {
    const state = createState("- [ ] Write report 🔁 every day 📅 2026-08-30");
    const replacement =
      "- [ ] Write report 🔁 every day 📅 2026-08-31\n- [x] Write report 🔁 every day 📅 2026-08-30 ✅ 2026-08-30";
    const transaction = replaceDocument(state, replacement);

    expect(transaction.newDoc.toString()).toBe(
      "- [ ] Write report 🔁 every day 📅 2026-08-31\n- [x] Write report 🔁 every day 📅 2026-08-30 ✅ 2026-08-30 🕒 14:32",
    );
  });

  it("ignores edits that do not change completion status", () => {
    const state = createState("- [ ] Write report");
    const transaction = replaceDocument(state, "- [ ] Write final report");

    expect(transaction.newDoc.toString()).toBe("- [ ] Write final report");
  });
});

function createState(document: string): EditorState {
  return EditorState.create({
    doc: document,
    extensions: [createCompletionTimeTransactionFilter(() => "14:32")],
  });
}

function replaceDocument(state: EditorState, replacement: string) {
  return state.update({ changes: { from: 0, to: state.doc.length, insert: replacement } });
}
