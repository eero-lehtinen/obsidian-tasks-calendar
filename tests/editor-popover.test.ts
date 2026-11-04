import { describe, expect, it, vi } from "vitest";
import { editorPopoverBounds } from "../src/tasks/editor-popover";

vi.mock("obsidian", () => ({ setIcon: vi.fn() }));

describe("editor popover positioning", () => {
  it("opens below the control when there is room", () => {
    const bounds = editorPopoverBounds(
      { left: 100, top: 100, bottom: 132 },
      { left: 0, top: 0, width: 800, height: 600 },
      200,
    );
    expect(bounds.top).toBe(140);
    expect(bounds.left).toBe(100);
  });

  it("moves above the control when the keyboard reduces the viewport", () => {
    const bounds = editorPopoverBounds(
      { left: 20, top: 230, bottom: 262 },
      { left: 0, top: 0, width: 390, height: 300 },
      180,
    );
    expect(bounds.top).toBe(42);
    expect(bounds.top + 180).toBeLessThanOrEqual(284);
  });

  it("limits tall panels to the visible space above the keyboard", () => {
    const bounds = editorPopoverBounds(
      { left: 20, top: 180, bottom: 212 },
      { left: 0, top: 0, width: 390, height: 260 },
      400,
    );
    expect(bounds.maxHeight).toBe(228);
    expect(bounds.top).toBe(16);
    expect(bounds.top + bounds.maxHeight).toBe(244);
  });

  it("accounts for the viewport scrolling when an input is focused", () => {
    const bounds = editorPopoverBounds(
      { left: 40, top: 380, bottom: 412 },
      { left: 20, top: 200, width: 390, height: 300 },
      180,
    );
    expect(bounds.top).toBeGreaterThanOrEqual(216);
    expect(bounds.top + 180).toBeLessThanOrEqual(484);
    expect(bounds.left).toBeGreaterThanOrEqual(36);
    expect(bounds.left + bounds.width).toBeLessThanOrEqual(394);
  });
});
