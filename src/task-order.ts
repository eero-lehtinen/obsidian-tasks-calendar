import { compareCalendarTasks } from "./task-sort";
import { taskVisualKey } from "./task-visual-key";
import type { CalendarTask } from "./types";

export function orderCalendarTasks(tasks: CalendarTask[], order: readonly string[] = []): CalendarTask[] {
  const positions = new Map(order.map((id, index) => [id, index]));
  return [...tasks].sort((left, right) => compareTaskPositions(left, right, positions));
}

export function compareTasksInOrder(left: CalendarTask, right: CalendarTask, order: readonly string[] = []): number {
  return compareTaskPositions(left, right, new Map(order.map((id, index) => [id, index])));
}

export function withoutTaskOrderKey(
  orders: Readonly<Record<string, readonly string[]>>,
  taskKey: string,
): Record<string, string[]> {
  const remainingOrders: Record<string, string[]> = {};
  for (const [date, taskKeys] of Object.entries(orders)) {
    const remainingKeys = taskKeys.filter((key) => key !== taskKey);
    if (remainingKeys.length > 0) remainingOrders[date] = remainingKeys;
  }
  return remainingOrders;
}

export function reorderTaskGroup(
  tasks: readonly CalendarTask[],
  activeId: string,
  overId: string | null,
): CalendarTask[] | null {
  const activeTask = tasks.find((task) => task.id === activeId);
  if (!activeTask) return null;

  const group = tasks.filter((task) => task.completed === activeTask.completed);
  const oldIndex = group.findIndex((task) => task.id === activeId);
  const newIndex = overId === null ? group.length - 1 : group.findIndex((task) => task.id === overId);
  if (newIndex === -1 || oldIndex === newIndex) return null;

  const reorderedGroup = [...group];
  const [movedTask] = reorderedGroup.splice(oldIndex, 1);
  reorderedGroup.splice(newIndex, 0, movedTask);
  const otherGroup = tasks.filter((task) => task.completed !== activeTask.completed);
  return activeTask.completed ? [...otherGroup, ...reorderedGroup] : [...reorderedGroup, ...otherGroup];
}

export const taskOrderKey = taskVisualKey;

function compareTaskPositions(left: CalendarTask, right: CalendarTask, positions: ReadonlyMap<string, number>): number {
  if (left.completed !== right.completed) return left.completed ? 1 : -1;
  const leftPosition = positions.get(taskOrderKey(left));
  const rightPosition = positions.get(taskOrderKey(right));
  if (leftPosition !== undefined && rightPosition !== undefined && leftPosition !== rightPosition) {
    return leftPosition - rightPosition;
  }
  if (leftPosition !== undefined) return -1;
  if (rightPosition !== undefined) return 1;
  return compareCalendarTasks(left, right);
}
