import { describe, expect, it } from "vitest";
import { insertTaskAtTop } from "../src/file-content";

describe("insertTaskAtTop", () => {
  it("prepends a task to a regular note", () => {
    expect(insertTaskAtTop("# Tasks\n\nExisting content\n", "- [ ] New task")).toBe(
      "- [ ] New task\n# Tasks\n\nExisting content\n"
    );
  });

  it("preserves YAML frontmatter at the beginning", () => {
    expect(insertTaskAtTop(
      "---\ntags:\n  - tasks\n---\n# Tasks\n",
      "- [ ] New task"
    )).toBe("---\ntags:\n  - tasks\n---\n- [ ] New task\n# Tasks\n");
  });
});
