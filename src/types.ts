export type CalendarMode = "month" | "week";
export type DateField = "scheduled" | "due" | "start";

export interface CalendarTask {
  id: string;
  path: string;
  line: number;
  raw: string;
  description: string;
  status: string;
  completed: boolean;
  tags: string[];
  priority: "highest" | "high" | "normal" | "low" | "lowest";
  scheduled: string | null;
  due: string | null;
  start: string | null;
  created: string | null;
  done: string | null;
  cancelled: string | null;
  recurrence: string | null;
}

export interface TasksCalendarSettings {
  defaultView: CalendarMode;
  weekStartsOn: 0 | 1;
  showCompleted: boolean;
  completedOpacity: number;
  defaultQuery: string;
  datePreference: DateField[];
  undatedTasks: "hide" | "today";
  newTaskFile: string;
  lastViewState: CalendarState | null;
  embeddedViewStates: Record<string, CalendarState>;
}

export interface CalendarState {
  mode: CalendarMode;
  anchor: string;
  query: string;
  showCompleted: boolean;
  search: string;
  monthHeight: number | null;
  weekHeight: number | null;
  selectedDate: string | null;
}

export interface QueryResult {
  predicate: (task: CalendarTask) => boolean;
  error: string | null;
}

export interface TasksApiV1 {
  createTaskLineModal(): Promise<string>;
  editTaskLineModal(taskLine: string): Promise<string>;
  executeToggleTaskDoneCommand(line: string, path: string): string;
}

export interface TasksPluginLike {
  apiV1?: TasksApiV1;
}
