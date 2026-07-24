export interface MonthCellLayout {
  cell: HTMLElement;
  list: HTMLElement;
  taskElements: HTMLElement[];
  moreButton: HTMLButtonElement;
}

export class CalendarLayoutController {
  private resizeObserver: ResizeObserver | null = null;
  private layoutFrame: number | null = null;

  reset(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.layoutFrame !== null) window.cancelAnimationFrame(this.layoutFrame);
    this.layoutFrame = null;
  }

  observeWeek(grid: HTMLElement, savedHeight: number | null, onHeightChange: (height: number) => void): void {
    if (savedHeight !== null) grid.style.height = `${savedHeight}px`;
    this.resizeObserver = new ResizeObserver((entries) => {
      const height = Math.round(entries[0]?.contentRect.height ?? 0);
      if (height > 0 && Math.abs(height - (savedHeight ?? 0)) > 1) onHeightChange(height);
    });
    this.resizeObserver.observe(grid);
  }

  observeMonth(grid: HTMLElement, layouts: MonthCellLayout[]): void {
    const fit = () => {
      for (const layout of layouts) fitMonthCell(layout);
    };
    this.layoutFrame = window.requestAnimationFrame(() => {
      this.layoutFrame = null;
      fit();
    });
    this.resizeObserver = new ResizeObserver(fit);
    this.resizeObserver.observe(grid);
  }
}

function fitMonthCell(layout: MonthCellLayout): void {
  const { cell, list, taskElements, moreButton } = layout;
  for (const task of taskElements) task.hidden = false;
  moreButton.hidden = true;

  const listTop = list.offsetTop - cell.offsetTop;
  const availableHeight = Math.max(0, cell.clientHeight - listTop - 5);
  if (list.scrollHeight <= availableHeight) return;

  moreButton.hidden = false;
  const moreHeight = moreButton.getBoundingClientRect().height;
  const taskHeightLimit = Math.max(0, availableHeight - moreHeight);
  let usedHeight = 0;
  let visibleCount = 0;
  let overflowed = false;
  for (const task of taskElements) {
    const height = task.getBoundingClientRect().height;
    const fits = !overflowed && usedHeight + height <= taskHeightLimit;
    task.hidden = !fits;
    if (fits) {
      usedHeight += height;
      visibleCount += 1;
    } else {
      overflowed = true;
    }
  }

  const hiddenCount = taskElements.length - visibleCount;
  moreButton.textContent = `+${hiddenCount} more`;
  moreButton.hidden = hiddenCount === 0;
}
