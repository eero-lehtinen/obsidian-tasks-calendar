import { diffChars } from "diff";

export interface TaskTextPosition {
  text: string;
  offset: number;
}

export function sourceOffsetAtRenderedPosition(source: string, position: TaskTextPosition): number {
  const target = Math.max(0, Math.min(position.offset, position.text.length));
  let renderedOffset = 0;
  let sourceOffset = 0;
  for (const change of diffChars(position.text, source)) {
    const length = change.value.length;
    if (change.added) {
      sourceOffset += length;
    } else if (change.removed) {
      if (target <= renderedOffset + length) return sourceOffset;
      renderedOffset += length;
    } else {
      if (target <= renderedOffset + length) return sourceOffset + target - renderedOffset;
      renderedOffset += length;
      sourceOffset += length;
    }
  }
  return source.length;
}

export function renderedPositionAtPoint(content: HTMLElement, x: number, y: number): TaskTextPosition | undefined {
  const document = content.ownerDocument;
  const caret = document.caretRangeFromPoint(x, y);
  if (!caret || !content.contains(caret.startContainer)) return undefined;
  const prefix = document.createRange();
  prefix.selectNodeContents(content);
  prefix.setEnd(caret.startContainer, caret.startOffset);
  return { text: content.textContent ?? "", offset: prefix.toString().length };
}
