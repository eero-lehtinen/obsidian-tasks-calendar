import { describe, expect, it } from "vitest";
import { swipeDirection } from "../src/calendar/use-day-swipe";

describe("swipeDirection", () => {
  it("moves forward for a left swipe and backward for a right swipe", () => {
    expect(swipeDirection({ x: 120, y: 40 }, { x: 60, y: 42 })).toBe(1);
    expect(swipeDirection({ x: 60, y: 40 }, { x: 120, y: 42 })).toBe(-1);
  });

  it("ignores short movements", () => {
    expect(swipeDirection({ x: 100, y: 40 }, { x: 51, y: 40 })).toBeNull();
  });

  it("ignores predominantly vertical movements", () => {
    expect(swipeDirection({ x: 100, y: 40 }, { x: 45, y: 100 })).toBeNull();
  });
});
