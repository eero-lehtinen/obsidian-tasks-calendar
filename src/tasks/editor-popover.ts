import { setIcon } from "obsidian";

interface VisibleViewport {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function editorVisibleViewport(
  viewport: VisibleViewport,
  layoutHeight: number,
  bottomInset: number,
): VisibleViewport {
  const bottom = Math.min(viewport.top + viewport.height, layoutHeight - Math.max(0, bottomInset));
  return { ...viewport, height: Math.max(0, bottom - viewport.top) };
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
  let layoutHeight = Math.max(view.innerHeight, parent.ownerDocument.documentElement.clientHeight);
  let insetProbe: HTMLDivElement | undefined;
  let insetObserver: MutationObserver | undefined;
  let panelObserver: ResizeObserver | undefined;
  let settleTimers: number[] = [];
  const position = (): void => {
    if (!panel.matches(":popover-open")) return;
    const visualViewport = view.visualViewport;
    layoutHeight = Math.max(layoutHeight, view.innerHeight, parent.ownerDocument.documentElement.clientHeight);
    const viewport = editorVisibleViewport(
      {
        left: visualViewport?.offsetLeft ?? 0,
        top: visualViewport?.offsetTop ?? 0,
        width: visualViewport?.width ?? view.innerWidth,
        height: visualViewport?.height ?? view.innerHeight,
      },
      layoutHeight,
      insetProbe?.getBoundingClientRect().height ?? 0,
    );
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
    insetObserver?.disconnect();
    insetObserver = undefined;
    panelObserver?.disconnect();
    panelObserver = undefined;
    for (const timer of settleTimers) view.clearTimeout(timer);
    settleTimers = [];
    insetProbe?.remove();
    insetProbe = undefined;
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
    stopPositioning();
    insetProbe = parent.createDiv({
      cls: "tasks-calendar-editor-keyboard-inset",
      attr: { "aria-hidden": "true" },
    });
    panel.showPopover();
    position();
    viewportListeners = new AbortController();
    const options = { signal: viewportListeners.signal };
    view.addEventListener("resize", position, options);
    view.visualViewport?.addEventListener("resize", position, options);
    view.visualViewport?.addEventListener("scroll", position, options);
    view.addEventListener(
      "orientationchange",
      () => {
        layoutHeight = view.innerHeight;
        position();
      },
      options,
    );
    insetObserver = new MutationObserver(position);
    for (const element of [parent.ownerDocument.documentElement, parent.ownerDocument.body]) {
      insetObserver.observe(element, { attributes: true, attributeFilter: ["style", "class"] });
    }
    panelObserver = new ResizeObserver(position);
    panelObserver.observe(panel);
    const settle = (): void => {
      for (const timer of settleTimers) view.clearTimeout(timer);
      settleTimers = [100, 300, 600].map((delay) => view.setTimeout(position, delay));
    };
    panel.addEventListener("focusin", settle, options);
    panel.addEventListener("focusout", settle, options);
    panel.querySelector("input")?.focus();
    settle();
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
