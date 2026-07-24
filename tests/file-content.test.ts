import { describe, expect, it } from "vitest";
import { deleteTaskLine, insertTaskAtTop } from "../src/file-content";

describe("insertTaskAtTop", () => {
  it("prepends a task to a regular note", () => {
    expect(insertTaskAtTop("# Tasks\n\nExisting content\n", "- [ ] New task")).toBe(
      "- [ ] New task\n# Tasks\n\nExisting content\n",
    );
  });

  it("preserves YAML frontmatter at the beginning", () => {
    expect(insertTaskAtTop("---\ntags:\n  - tasks\n---\n# Tasks\n", "- [ ] New task")).toBe(
      "---\ntags:\n  - tasks\n---\n- [ ] New task\n# Tasks\n",
    );
  });
});

describe("deleteTaskLine", () => {
  it("deletes the task at its expected line while preserving line endings", () => {
    expect(deleteTaskLine("# Tasks\r\n- [ ] Remove me\r\nKeep this\r\n", "- [ ] Remove me", 1)).toBe(
      "# Tasks\r\nKeep this\r\n",
    );
  });

  it("finds the task by content when its stored line number is stale", () => {
    expect(deleteTaskLine("Inserted\n- [ ] Remove me\nKeep this", "- [ ] Remove me", 0)).toBe("Inserted\nKeep this");
  });

  it("refuses to delete when the task content changed", () => {
    expect(() => deleteTaskLine("- [ ] Updated task", "- [ ] Original task", 0)).toThrow(
      "The task changed before it could be deleted.",
    );
  });
});
