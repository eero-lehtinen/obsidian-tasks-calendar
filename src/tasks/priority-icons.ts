import { addIcon } from "obsidian";
import type { TaskPriority } from "./task-editor-model";

export const priorityIconPaths: Record<TaskPriority, string[]> = {
  highest: ["M1.3 11.2 7 2 12.7 11.2Z", "M5.1 9.4 7 6.3 8.9 9.4Z"],
  high: ["M2.2 7 7 2.2 11.8 7Z", "M2.2 12.2 7 7.4 11.8 12.2Z"],
  medium: ["M1.8 10.5 7 3.3 12.2 10.5Z"],
  normal: ["M2 6H12V8H2Z"],
  low: ["M1.8 3.5 7 10.7 12.2 3.5Z"],
  lowest: ["M2.2 1.8 7 6.6 11.8 1.8Z", "M2.2 7 7 11.8 11.8 7Z"],
};

export function priorityPathAttributes(priority: TaskPriority, index: number) {
  return priority === "highest" && index === 0
    ? { fill: "none", stroke: "currentColor", strokeWidth: 1.2 }
    : { fill: "currentColor" };
}

export function priorityIconName(priority: TaskPriority): string {
  return `tasks-calendar-priority-${priority}`;
}

export function registerPriorityIcons(): void {
  for (const priority of Object.keys(priorityIconPaths) as TaskPriority[]) {
    const paths = priorityIconPaths[priority]
      .map((path, index) => {
        const outline = priority === "highest" && index === 0;
        return `<path d="${path}" fill="${outline ? "none" : "currentColor"}" stroke="${outline ? "currentColor" : "none"}" stroke-width="${outline ? "1.2" : "0"}"/>`;
      })
      .join("");
    addIcon(priorityIconName(priority), `<g transform="scale(${100 / 14})">${paths}</g>`);
  }
}
