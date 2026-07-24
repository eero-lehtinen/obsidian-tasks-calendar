import { describe, expect, it } from "vitest";
import { recurrenceDateKeys } from "../src/recurrence";

describe("recurrenceDateKeys", () => {
  it("calculates weekly occurrences from the task date", () => {
    expect(Array.from(recurrenceDateKeys(
      "every week",
      "2026-07-24",
      "2026-07-20",
      "2026-08-16"
    ))).toEqual([
      "2026-07-24",
      "2026-07-31",
      "2026-08-07",
      "2026-08-14"
    ]);
  });

  it("accepts Tasks when-done suffixes", () => {
    expect(recurrenceDateKeys(
      "every day when done",
      "2026-07-24",
      "2026-07-24",
      "2026-07-26"
    ).size).toBe(3);
  });

  it("returns no dates for an invalid rule", () => {
    expect(recurrenceDateKeys(
      "sometimes perhaps",
      "2026-07-24",
      "2026-07-20",
      "2026-08-16"
    ).size).toBe(0);
  });
});
