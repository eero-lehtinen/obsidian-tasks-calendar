import { describe, expect, it, vi } from "vitest";
import { editorPopoverBounds, editorVisibleViewport } from "../src/tasks/editor-popover";

vi.mock("obsidian", () => ({ Platform: { isMobile: false }, setIcon: vi.fn() }));

describe("editor popover positioning", () => {
  it("keeps mobile panels above the control before and after the keyboard opens", () => {
    const anchor = { left: 20, top: 300, bottom: 332 };
    const before = editorPopoverBounds(anchor, { left: 0, top: 0, width: 390, height: 800 }, 180, "above");
    const after = editorPopoverBounds(anchor, { left: 0, top: 0, width: 390, height: 480 }, 180, "above");
    expect(before.top).toBe(112);
    expect(after.top).toBe(before.top);
  });

  it("keeps upward-opening panels within the viewport when space above is limited", () => {
    const bounds = editorPopoverBounds(
      { left: 20, top: 120, bottom: 152 },
      { left: 0, top: 0, width: 390, height: 480 },
      200,
      "above",
    );
    expect(bounds.top).toBe(16);
  });

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

describe("editor visible viewport", () => {
  it("uses the keyboard inset when the WebView viewport does not resize", () => {
    const viewport = editorVisibleViewport({ left: 0, top: 0, width: 390, height: 891 }, 891, 379);
    expect(viewport.height).toBe(512);
    const bounds = editorPopoverBounds({ left: 20, top: 440, bottom: 472 }, viewport, 240);
    expect(bounds.top + 240).toBeLessThanOrEqual(496);
    expect(bounds.top).toBeLessThan(440);
  });

  it("does not subtract the keyboard twice when the viewport already shrank", () => {
    expect(editorVisibleViewport({ left: 0, top: 0, width: 390, height: 500 }, 800, 300).height).toBe(500);
  });

  it("combines a scrolled viewport and the keyboard inset", () => {
    const viewport = editorVisibleViewport({ left: 0, top: 100, width: 390, height: 600 }, 800, 300);
    expect(viewport.top + viewport.height).toBe(500);
  });

  it("follows the browser viewport when there is no reported inset", () => {
    const viewport = { left: 0, top: 0, width: 390, height: 500 };
    expect(editorVisibleViewport(viewport, 800, 0)).toEqual(viewport);
  });
});
