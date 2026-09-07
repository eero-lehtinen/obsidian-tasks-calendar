import type { ReactNode } from "react";
import { useRef } from "react";

export function OverduePanel({
  children,
  height,
  onHeightChange,
}: {
  children: ReactNode;
  height: number | null;
  onHeightChange: (height: number) => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ pointerId: number; y: number; height: number } | null>(null);

  const resize = (nextHeight: number) => {
    const panel = panelRef.current;
    if (!panel) return;
    const available = panel.parentElement?.clientHeight ?? 0;
    const maximum = Math.max(0, available - 80);
    const minimum = Math.min(60, maximum);
    const clamped = Math.round(Math.max(minimum, Math.min(nextHeight, maximum)));
    panel.style.maxHeight = "max(0px, calc(100% - 80px))";
    panel.style.height = `${clamped}px`;
    return clamped;
  };

  return (
    <section
      className="tasks-calendar-overdue-tasks"
      ref={panelRef}
      style={height === null ? undefined : { height, maxHeight: "max(0px, calc(100% - 80px))" }}
    >
      <button
        aria-label="Resize overdue tasks"
        className="tasks-calendar-overdue-resize"
        onKeyDown={(event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          const current = panelRef.current?.getBoundingClientRect().height ?? 0;
          const next = resize(current + (event.key === "ArrowUp" ? 20 : -20));
          if (next !== undefined) onHeightChange(next);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          dragRef.current = {
            pointerId: event.pointerId,
            y: event.clientY,
            height: panelRef.current?.getBoundingClientRect().height ?? 0,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (drag?.pointerId !== event.pointerId) return;
          resize(drag.height + drag.y - event.clientY);
        }}
        onLostPointerCapture={() => {
          if (!dragRef.current) return;
          dragRef.current = null;
          const current = panelRef.current?.getBoundingClientRect().height;
          if (current !== undefined) onHeightChange(Math.round(current));
        }}
        title="Drag to resize overdue tasks, or use the up and down arrow keys"
        type="button"
      />
      {children}
    </section>
  );
}
