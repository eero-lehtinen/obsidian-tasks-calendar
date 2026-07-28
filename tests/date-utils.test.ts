import { describe, expect, it } from "vitest";
import {
  calendarDays,
  isoWeekNumber,
  moveAnchor,
  startOfWeek,
  titleForRange,
  toDateKey,
} from "../src/calendar/date-utils";

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

  it("builds and navigates a single-day range", () => {
    const date = new Date(2026, 6, 24);
    expect(calendarDays(date, "day", 1).map(toDateKey)).toEqual(["2026-07-24"]);
    expect(toDateKey(moveAnchor(date, "day", 1))).toBe("2026-07-25");
    expect(titleForRange(date, "day", 1, "en-US")).toBe("Friday, July 24, 2026");
  });
});

describe("isoWeekNumber", () => {
  it("handles ISO week year boundaries", () => {
    expect(isoWeekNumber(new Date(2026, 0, 1))).toBe(1);
    expect(isoWeekNumber(new Date(2027, 0, 1))).toBe(53);
    expect(isoWeekNumber(new Date(2027, 0, 4))).toBe(1);
  });
});
