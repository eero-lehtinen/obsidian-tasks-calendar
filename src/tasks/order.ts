import type { CalendarTask } from "../types";
import { compareCalendarTasks } from "./sort";
import { taskVisualKey } from "./visual-key";

export function orderCalendarTasks(tasks: CalendarTask[], order: readonly string[] = []): CalendarTask[] {
  const positions = new Map(order.map((id, index) => [id, index]));
  return [false, true].flatMap((completed) => orderCompletionGroup(tasks, positions, completed));
}

export function compareTasksInOrder(left: CalendarTask, right: CalendarTask, order: readonly string[] = []): number {
  if (left === right) return 0;
  const ordered = orderCalendarTasks([left, right], order);
  return ordered[0] === left ? -1 : 1;
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

export function withoutTaskOrderDate(
  orders: Readonly<Record<string, readonly string[]>>,
  date: string,
): Record<string, string[]> {
  const remainingOrders: Record<string, string[]> = {};
  for (const [orderedDate, taskKeys] of Object.entries(orders)) {
    if (orderedDate !== date) remainingOrders[orderedDate] = [...taskKeys];
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
  const priorityOrder = priorityRank(left) - priorityRank(right);
  if (priorityOrder !== 0) return priorityOrder;
  const leftPosition = positions.get(taskOrderKey(left));
  const rightPosition = positions.get(taskOrderKey(right));
  if (leftPosition !== undefined && rightPosition !== undefined && leftPosition !== rightPosition) {
    return leftPosition - rightPosition;
  }
  if (leftPosition !== undefined) return -1;
  if (rightPosition !== undefined) return 1;
  return compareCalendarTasks(left, right);
}

function orderCompletionGroup(
  tasks: readonly CalendarTask[],
  positions: ReadonlyMap<string, number>,
  completed: boolean,
): CalendarTask[] {
  const group = tasks.filter((task) => task.completed === completed);
  if (!hasCrossPriorityOrder(group, positions, completed)) {
    return group.sort((left, right) => compareTaskPositions(left, right, positions));
  }

  const manuallyOrdered = group
    .flatMap((task) => {
      const position = positions.get(taskOrderKey(task));
      return position === undefined ? [] : [{ position, task }];
    })
    .sort((left, right) => left.position - right.position)
    .map(({ task }) => task);
  const newTasks = group.filter((task) => !positions.has(taskOrderKey(task))).sort(compareCalendarTasks);

  for (const task of newTasks) insertByPriority(manuallyOrdered, task);
  return manuallyOrdered;
}

function insertByPriority(tasks: CalendarTask[], task: CalendarTask): void {
  let lastSamePriority = -1;
  for (let index = tasks.length - 1; index >= 0; index -= 1) {
    if (tasks[index].priority !== task.priority) continue;
    lastSamePriority = index;
    break;
  }
  if (lastSamePriority !== -1) {
    tasks.splice(lastSamePriority + 1, 0, task);
    return;
  }

  let lastHigherPriority = -1;
  for (let index = tasks.length - 1; index >= 0; index -= 1) {
    if (priorityRank(tasks[index]) >= priorityRank(task)) continue;
    lastHigherPriority = index;
    break;
  }
  tasks.splice(lastHigherPriority + 1, 0, task);
}

function hasCrossPriorityOrder(
  tasks: readonly CalendarTask[],
  positions: ReadonlyMap<string, number>,
  completed: boolean,
): boolean {
  const orderedPriorities = tasks
    .flatMap((task) => {
      const position = positions.get(taskOrderKey(task));
      return task.completed === completed && position !== undefined ? [{ position, rank: priorityRank(task) }] : [];
    })
    .sort((left, right) => left.position - right.position)
    .map(({ rank }) => rank);

  let highestRank = -1;
  for (const rank of orderedPriorities) {
    if (rank < highestRank) return true;
    highestRank = Math.max(highestRank, rank);
  }
  return false;
}

function priorityRank(task: CalendarTask): number {
  return ["highest", "high", "medium", "normal", "low", "lowest"].indexOf(task.priority);
}
