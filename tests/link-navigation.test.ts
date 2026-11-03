import { Keymap } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleTaskLinkClick } from "../src/tasks/link-navigation";

vi.mock("obsidian", () => ({ Keymap: { isModEvent: vi.fn(() => false) } }));

const workspace = { openLinkText: vi.fn(async () => {}) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(Keymap.isModEvent).mockReturnValue(false);
});

describe("task link navigation", () => {
  it("opens an internal link relative to the task source, including its subpath", () => {
    const event = linkEvent({ "data-href": "../Notes/Target#Heading", href: "fallback" });

    handleTaskLinkClick(event, workspace, "Tasks/Today.md");

    expect(workspace.openLinkText).toHaveBeenCalledExactlyOnceWith("../Notes/Target#Heading", "Tasks/Today.md", false);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
  });

  it("falls back to href when data-href is absent", () => {
    handleTaskLinkClick(linkEvent({ href: "Target#^block" }), workspace, "Tasks.md");

    expect(workspace.openLinkText).toHaveBeenCalledExactlyOnceWith("Target#^block", "Tasks.md", false);
  });

  it.each([0, 1])("uses Obsidian's pane selection for mouse button %i", (button) => {
    vi.mocked(Keymap.isModEvent).mockReturnValue("tab");
    const event = linkEvent({ "data-href": "Target" }, button);

    handleTaskLinkClick(event, workspace, "Tasks.md");

    expect(Keymap.isModEvent).toHaveBeenCalledWith(event);
    expect(workspace.openLinkText).toHaveBeenCalledExactlyOnceWith("Target", "Tasks.md", "tab");
  });

  it("leaves external links and ordinary task text to their existing handlers", () => {
    const event = linkEvent(null);

    handleTaskLinkClick(event, workspace, "Tasks.md");

    expect(workspace.openLinkText).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  it("ignores right clicks and clicks that were already handled", () => {
    handleTaskLinkClick(linkEvent({ href: "Target" }, 2), workspace, "Tasks.md");
    const event = linkEvent({ href: "Target" });
    Object.assign(event, { defaultPrevented: true });
    handleTaskLinkClick(event, workspace, "Tasks.md");

    expect(workspace.openLinkText).not.toHaveBeenCalled();
  });
});

function linkEvent(attributes: Record<string, string> | null, button = 0): MouseEvent {
  const link = attributes ? { getAttribute: (name: string) => attributes[name] ?? null } : null;
  return {
    button,
    defaultPrevented: false,
    target: { closest: (selector: string) => (selector === "a.internal-link" ? link : null) },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as MouseEvent;
}
