export interface MonthCellLayout {
  cell: HTMLElement;
  taskElements: HTMLElement[];
  moreButton: HTMLButtonElement;
}

export class CalendarLayoutController {
  private heightObserver: ResizeObserver | null = null;
  private monthObserver: ResizeObserver | null = null;
  private layoutFrame: number | null = null;
  private heightGrid: HTMLElement | null = null;
  private monthPointerUp: (() => void) | null = null;
  private resizeStart: { pointerId: number } | null = null;
  private readonly onPointerDown = (event: PointerEvent) => {
    const grid = event.currentTarget as HTMLElement;
    const bounds = grid.getBoundingClientRect();
    if (event.clientX < bounds.right - 24 || event.clientY < bounds.bottom - 24) return;
    this.resizeStart = { pointerId: event.pointerId };
  };
  private onPointerUp: ((event: PointerEvent) => void) | null = null;

  reset(): void {
    this.heightObserver?.disconnect();
    this.heightObserver = null;
    this.monthObserver?.disconnect();
    this.monthObserver = null;
    if (this.monthPointerUp) window.removeEventListener("pointerup", this.monthPointerUp);
    this.monthPointerUp = null;
    if (this.layoutFrame !== null) window.cancelAnimationFrame(this.layoutFrame);
    this.layoutFrame = null;
    this.resizeStart = null;
    this.heightGrid?.removeEventListener("pointerdown", this.onPointerDown);
    this.heightGrid = null;
    if (this.onPointerUp) window.removeEventListener("pointerup", this.onPointerUp);
    this.onPointerUp = null;
  }

  observeHeight(
    grid: HTMLElement,
    desiredHeight: number | null,
    onHeightChange: (height: number) => void,
    availableHeight: (() => number | null) | null,
  ): void {
    const applyHeight = () => {
      if (desiredHeight === null) {
        grid.style.removeProperty("height");
        grid.style.removeProperty("min-height");
        return;
      }
      const available = availableHeight?.();
      grid.style.height = `${Math.min(desiredHeight, available ?? desiredHeight)}px`;
      if (available !== undefined && available !== null) grid.style.minHeight = "0";
    };
    applyHeight();

    if (availableHeight) {
      this.heightObserver = new ResizeObserver(applyHeight);
      const parent = grid.parentElement;
      if (parent) this.heightObserver.observe(parent);
    }

    this.onPointerUp = (event) => {
      if (event.pointerId !== this.resizeStart?.pointerId) return;
      const height = Math.round(grid.getBoundingClientRect().height);
      this.resizeStart = null;
      if (height > 0) onHeightChange(height);
    };
    this.heightGrid = grid;
    grid.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointerup", this.onPointerUp);
  }

  observeMonth(grid: HTMLElement, layouts: MonthCellLayout[]): void {
    const scheduleFit = () => {
      if (this.layoutFrame !== null) return;
      this.layoutFrame = window.requestAnimationFrame(() => {
        this.layoutFrame = null;
        for (const layout of layouts) fitMonthCell(layout);
      });
    };
    scheduleFit();
    this.monthObserver = new ResizeObserver(scheduleFit);
    this.monthObserver.observe(grid);
    for (const { cell } of layouts) this.monthObserver.observe(cell);
    this.monthPointerUp = scheduleFit;
    window.addEventListener("pointerup", this.monthPointerUp);
  }
}

function fitMonthCell(layout: MonthCellLayout): void {
  const { cell, taskElements, moreButton } = layout;
  for (const task of taskElements) task.hidden = false;
  moreButton.hidden = true;

  const paddingBottom = Number.parseFloat(window.getComputedStyle(cell).paddingBottom) || 0;
  const cellBottom = cell.getBoundingClientRect().bottom - paddingBottom;
  const lastTask = taskElements[taskElements.length - 1];
  if (!lastTask || lastTask.getBoundingClientRect().bottom <= cellBottom) return;

  moreButton.hidden = false;
  const moreHeight = moreButton.getBoundingClientRect().height;
  const taskBottomLimit = cellBottom - moreHeight;
  let visibleCount = 0;
  for (const task of taskElements) {
    const fits = task.getBoundingClientRect().bottom <= taskBottomLimit;
    task.hidden = !fits;
    if (fits) visibleCount += 1;
  }

  const hiddenCount = taskElements.length - visibleCount;
  moreButton.textContent = `+${hiddenCount} more`;
  moreButton.hidden = hiddenCount === 0;
}
