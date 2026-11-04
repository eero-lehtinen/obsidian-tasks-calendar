import { describe, expect, it } from "vitest";
import { sourceOffsetAtRenderedPosition } from "../src/tasks/editor-caret";

describe("task editor caret", () => {
  it("keeps plain-text click positions", () => {
    expect(sourceOffsetAtRenderedPosition("Write docs", { text: "Write docs", offset: 6 })).toBe(6);
  });

  it("accounts for Markdown formatting before the clicked text", () => {
    expect(sourceOffsetAtRenderedPosition("**Write** docs", { text: "Write docs", offset: 7 })).toBe(11);
    expect(sourceOffsetAtRenderedPosition("**Write** docs", { text: "Write docs", offset: 2 })).toBe(4);
  });

  it("skips link destinations before the clicked text", () => {
    const source = "Read [docs](https://example.com) today";
    expect(sourceOffsetAtRenderedPosition(source, { text: "Read docs today", offset: 12 })).toBe(
      source.indexOf("today") + 2,
    );
  });

  it("uses text-control offsets for emoji", () => {
    expect(sourceOffsetAtRenderedPosition("**🚀 Ship** today", { text: "🚀 Ship today", offset: 5 })).toBe(7);
  });

  it("maps the start and end of formatted text", () => {
    expect(sourceOffsetAtRenderedPosition("**Task**", { text: "Task", offset: 0 })).toBe(2);
    expect(sourceOffsetAtRenderedPosition("**Task**", { text: "Task", offset: 4 })).toBe(6);
  });
});
