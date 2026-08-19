import type { RefObject } from "react";
import { useEffect } from "react";

interface Point {
  x: number;
  y: number;
}

interface TrackedTouch extends Point {
  identifier: number;
}

const minimumSwipeDistance = 50;
const horizontalIntentRatio = 1.25;

export function swipeDirection(start: Point, end: Point): -1 | 1 | null {
  const horizontalDistance = end.x - start.x;
  const verticalDistance = end.y - start.y;

  if (
    Math.abs(horizontalDistance) < minimumSwipeDistance ||
    Math.abs(horizontalDistance) < Math.abs(verticalDistance) * horizontalIntentRatio
  ) {
    return null;
  }

  return horizontalDistance < 0 ? 1 : -1;
}

export function useDaySwipe({
  enabled,
  gridRef,
  onSwipe,
}: {
  enabled: boolean;
  gridRef: RefObject<HTMLDivElement | null>;
  onSwipe: (direction: -1 | 1) => void;
}): void {
  useEffect(() => {
    const grid = gridRef.current;
    if (!enabled || !grid) return;

    let start: TrackedTouch | null = null;
    const reset = () => {
      start = null;
    };
    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        reset();
        return;
      }

      const touch = event.touches[0];
      start = { identifier: touch.identifier, x: touch.clientX, y: touch.clientY };
    };
    const handleTouchEnd = (event: TouchEvent) => {
      if (!start) return;

      const touch = Array.from(event.changedTouches).find((candidate) => candidate.identifier === start?.identifier);
      if (!touch) return;

      const direction = swipeDirection(start, { x: touch.clientX, y: touch.clientY });
      reset();
      if (direction === null) return;

      event.preventDefault();
      onSwipe(direction);
    };

    grid.addEventListener("touchstart", handleTouchStart, { passive: true });
    grid.addEventListener("touchend", handleTouchEnd, { passive: false });
    grid.addEventListener("touchcancel", reset);

    return () => {
      grid.removeEventListener("touchstart", handleTouchStart);
      grid.removeEventListener("touchend", handleTouchEnd);
      grid.removeEventListener("touchcancel", reset);
    };
  }, [enabled, gridRef, onSwipe]);
}
