import { setIcon } from "obsidian";

interface VisibleViewport {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function editorPopoverBounds(
  anchor: Pick<DOMRect, "left" | "top" | "bottom">,
  viewport: VisibleViewport,
  panelHeight: number,
) {
  const width = Math.max(0, Math.min(360, viewport.width - 32));
  const maxHeight = Math.max(0, viewport.height - 32);
  const height = Math.min(panelHeight, maxHeight);
  const topEdge = viewport.top + 16;
  const bottomEdge = viewport.top + viewport.height - 16;
  const below = anchor.bottom + 8;
  const above = anchor.top - height - 8;
  const preferredTop = below + height <= bottomEdge ? below : above;
  return {
    width,
    maxHeight,
    left: Math.max(viewport.left + 16, Math.min(anchor.left, viewport.left + viewport.width - width - 16)),
    top: Math.max(topEdge, Math.min(preferredTop, bottomEdge - height)),
  };
}

export function addEditorPopover(parent: HTMLElement, icon: string | null, label: string) {
  const summary = parent.createEl("button", {
    cls: "tasks-calendar-editor-chip",
    attr: { type: "button", "aria-label": label, "aria-expanded": "false", "aria-haspopup": "dialog" },
  });
  if (icon) setIcon(summary.createSpan(), icon);
  const caption = summary.createSpan();
  const panel = parent.createDiv({
    cls: "tasks-calendar-editor-property-panel",
    attr: { popover: "auto", role: "dialog", "aria-label": label },
  });
  let viewportListeners: AbortController | undefined;
  const view = parent.ownerDocument.defaultView ?? window;
  const position = (): void => {
    if (!panel.matches(":popover-open")) return;
    const visualViewport = view.visualViewport;
    const viewport = {
      left: visualViewport?.offsetLeft ?? 0,
      top: visualViewport?.offsetTop ?? 0,
      width: visualViewport?.width ?? view.innerWidth,
      height: visualViewport?.height ?? view.innerHeight,
    };
    const anchor = summary.getBoundingClientRect();
    const size = editorPopoverBounds(anchor, viewport, 0);
    panel.style.width = `${size.width}px`;
    panel.style.maxHeight = `${size.maxHeight}px`;
    const bounds = editorPopoverBounds(anchor, viewport, panel.getBoundingClientRect().height);
    panel.style.left = `${bounds.left}px`;
    panel.style.top = `${bounds.top}px`;
  };
  const stopPositioning = (): void => {
    viewportListeners?.abort();
    viewportListeners = undefined;
  };
  const close = (): void => {
    stopPositioning();
    if (panel.matches(":popover-open")) panel.hidePopover();
  };
  summary.addEventListener("click", () => {
    if (panel.matches(":popover-open")) {
      close();
      return;
    }
    panel.showPopover();
    position();
    stopPositioning();
    viewportListeners = new AbortController();
    const options = { signal: viewportListeners.signal };
    view.addEventListener("resize", position, options);
    view.visualViewport?.addEventListener("resize", position, options);
    view.visualViewport?.addEventListener("scroll", position, options);
    panel.querySelector("input")?.focus();
  });
  panel.addEventListener("toggle", () => {
    const open = panel.matches(":popover-open");
    summary.setAttribute("aria-expanded", String(open));
    if (!open) stopPositioning();
  });
  panel.addEventListener("keydown", (event) => {
    const confirmsInput = event.key === "Enter" && event.target instanceof HTMLInputElement;
    if ((event.key !== "Escape" && !confirmsInput) || event.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    close();
    summary.focus();
  });
  return { summary, caption, panel, close, dispose: close };
}
