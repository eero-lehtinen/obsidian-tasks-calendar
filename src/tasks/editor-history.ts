export class EditorHistory<T> {
  private readonly past: T[] = [];
  private readonly future: T[] = [];
  private group: string | undefined;
  private lastChange = 0;

  constructor(
    private current: T,
    private readonly equal: (a: T, b: T) => boolean = (a, b) => JSON.stringify(a) === JSON.stringify(b),
  ) {}

  updateCurrent(state: T): void {
    if (this.equal(state, this.current)) this.current = state;
  }

  record(state: T, group?: string, now = Date.now()): void {
    if (this.equal(state, this.current)) return;
    if (!group || group !== this.group || now - this.lastChange > 750) {
      this.past.push(this.current);
      if (this.past.length > 100) this.past.shift();
    }
    this.current = state;
    this.future.length = 0;
    this.group = group;
    this.lastChange = now;
  }

  breakGroup(): void {
    this.group = undefined;
  }

  undo(): T | undefined {
    this.breakGroup();
    const previous = this.past.pop();
    if (previous === undefined) return undefined;
    this.future.push(this.current);
    this.current = previous;
    return previous;
  }

  redo(): T | undefined {
    this.breakGroup();
    const next = this.future.pop();
    if (next === undefined) return undefined;
    this.past.push(this.current);
    this.current = next;
    return next;
  }
}
