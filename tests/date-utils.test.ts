import { describe, expect, it } from "vitest";
import { calendarDays, isoWeekNumber, startOfWeek, titleForRange, toDateKey } from "../src/date-utils";

describe("calendarDays", () => {
  it("builds a complete six-week month grid when required", () => {
    const days = calendarDays(new Date(2026, 7, 15), "month", 1);
    expect(days).toHaveLength(42);
    expect(toDateKey(days[0])).toBe("2026-07-27");
    expect(toDateKey(days[41])).toBe("2026-09-06");
  });

  it("honors Sunday and Monday week starts", () => {
    const date = new Date(2026, 6, 24);
    expect(toDateKey(startOfWeek(date, 0))).toBe("2026-07-19");
    expect(toDateKey(startOfWeek(date, 1))).toBe("2026-07-20");
    expect(titleForRange(date, "week", 0, "en-US")).toContain("Jul 19");
  });
});

describe("isoWeekNumber", () => {
  it("handles ISO week year boundaries", () => {
    expect(isoWeekNumber(new Date(2026, 0, 1))).toBe(1);
    expect(isoWeekNumber(new Date(2027, 0, 1))).toBe(53);
    expect(isoWeekNumber(new Date(2027, 0, 4))).toBe(1);
  });
});
