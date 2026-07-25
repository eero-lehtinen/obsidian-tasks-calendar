import { Menu } from "obsidian";
import type TasksCalendarPlugin from "./main";
import type { CalendarTask } from "./types";

const DELETE_HOLD_DURATION_MS = 800;

export function showTaskActions(
  plugin: TasksCalendarPlugin,
  task: CalendarTask,
  position: { x: number; y: number },
): void {
  const menu = new Menu().setUseNativeMenu(false);
  menu.addItem((item) =>
    item
      .setTitle("Edit task")
      .setIcon("pencil")
      .onClick(() => void plugin.editTask(task)),
  );
  menu.addItem((item) =>
    item
      .setTitle("Open source")
      .setIcon("file-text")
      .onClick(() => void plugin.openTask(task)),
  );
  addHoldToDeleteItem(menu, plugin, task);
  menu.showAtPosition(position);
}

function addHoldToDeleteItem(menu: Menu, plugin: TasksCalendarPlugin, task: CalendarTask): void {
  const title = document.createDocumentFragment();
  const holdControl = title.createSpan({ cls: "tasks-calendar-delete-hold" });
  const fill = holdControl.createSpan({ cls: "tasks-calendar-delete-hold-fill" });
  const label = holdControl.createSpan({ cls: "tasks-calendar-delete-hold-label", text: "Hold to delete" });
  let timer: number | null = null;

  const cancel = () => {
    if (timer === null) return;
    window.clearTimeout(timer);
    timer = null;
    holdControl.removeClass("is-holding");
    label.setText("Hold to delete");
  };
  const start = () => {
    if (timer !== null) return;
    holdControl.addClass("is-holding");
    label.setText("Keep holding…");
    timer = window.setTimeout(() => {
      timer = null;
      menu.close();
      void plugin.deleteTask(task);
    }, DELETE_HOLD_DURATION_MS);
  };

  menu.addItem((item) =>
    item
      .setTitle(title)
      .setIcon("trash-2")
      .setWarning(true)
      .onClick((event) => {
        event.preventDefault();
        event.stopPropagation();
      }),
  );
  menu.onHide(cancel);

  window.setTimeout(() => {
    const menuItem = fill.closest<HTMLElement>(".menu-item");
    menuItem?.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      { capture: true },
    );
    menuItem?.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      menuItem.setPointerCapture(event.pointerId);
      start();
    });
    for (const eventName of ["pointerup", "pointercancel", "pointerleave"] as const) {
      menuItem?.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      });
    }
    menuItem?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      start();
    });
    menuItem?.addEventListener("keyup", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
    });
  });
}
