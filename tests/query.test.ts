import { describe, expect, it } from "vitest";
import { parseTaskLine } from "../src/tasks/parser";
import { compileQuery } from "../src/tasks/query";

const task = parseTaskLine("- [ ] Write tests #work ⏳ 2026-07-24", "Projects/Test.md", 0)!;

describe("compileQuery", () => {
  it("combines task filters", () => {
    const query = compileQuery("not done\npath includes Projects\nscheduled on today", new Date(2026, 6, 24));
    expect(query.error).toBeNull();
    expect(query.predicate(task)).toBe(true);
  });

  it("reports unsupported filters", () => {
    expect(compileQuery("urgency above 10").error).toContain("Unsupported filter");
  });

  it("supports parenthesized boolean combinations", () => {
    const query = compileQuery("(scheduled today) OR ((due today) AND (NOT done))", new Date(2026, 6, 24));
    expect(query.error).toBeNull();
    expect(query.predicate(task)).toBe(true);
  });
});
