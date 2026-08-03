import { Menu } from "obsidian";
import type TasksCalendarPlugin from "../main";

export function showDayActions(plugin: TasksCalendarPlugin, date: string, position: { x: number; y: number }): void {
  const menu = new Menu().setUseNativeMenu(false);
  menu.addItem((item) =>
    item
      .setTitle("Create new task")
      .setIcon("plus")
      .onClick(() => void plugin.createTask(date)),
  );
  menu.addItem((item) =>
    item
      .setTitle("Reset manual ordering")
      .setIcon("list-restart")
      .setDisabled(plugin.settings.taskOrder[date] === undefined)
      .onClick(() => plugin.resetTaskOrder(date)),
  );
  menu.showAtPosition(position);
}
