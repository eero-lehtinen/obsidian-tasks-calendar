import { Menu, setIcon } from "obsidian";
import { addEditorPopover } from "./editor-popover";
import { priorityIconName, registerPriorityIcons } from "./priority-icons";
import { parseTaskDate, type TaskEditorModel, type TaskPriority, validateRecurrence } from "./task-editor-model";

const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: "highest", label: "Highest" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" },
  { value: "lowest", label: "Lowest" },
];

export function addTaskMetadata(form: HTMLFormElement, model: TaskEditorModel) {
  registerPriorityIcons();
  const row = form.createDiv({ cls: "tasks-calendar-editor-metadata" });
  const dateChip = row.createDiv({ cls: "tasks-calendar-editor-date-chip" });
  const calendarHost = dateChip.createDiv({ cls: "tasks-calendar-editor-date-picker-host" });
  const calendarShortcut = calendarHost.createEl("button", {
    cls: "tasks-calendar-editor-chip tasks-calendar-editor-date-shortcut",
    attr: { type: "button", "aria-label": "Choose due date (Alt+D)", "aria-keyshortcuts": "Alt+D" },
  });
  setIcon(calendarShortcut, "calendar-days");
  const due = addEditorPopover(dateChip, null, "Edit due date");
  const dueInput = addInput(due.panel, "Due date", "tasks-calendar-editor-due", "Tomorrow or YYYY-MM-DD", model.due);
  const dueControls = due.panel.createDiv({ cls: "tasks-calendar-editor-date-controls" });
  dueControls.appendChild(dueInput);
  const datePickerHost = dueControls.createDiv({ cls: "tasks-calendar-editor-date-picker-host" });
  const datePickerButton = datePickerHost.createEl("button", {
    attr: { "aria-label": "Choose due date", type: "button" },
    cls: "tasks-calendar-editor-date-picker",
  });
  setIcon(datePickerButton, "calendar-days");
  const createDatePicker = (host: HTMLElement): HTMLInputElement => {
    const picker = host.createEl("input", {
      attr: { "aria-label": "Due date picker", tabindex: "-1", type: "date" },
      cls: "tasks-calendar-editor-date-picker-input",
    });
    picker.value = model.due;
    picker.addEventListener("input", () => {
      dueInput.value = picker.value;
    });
    return picker;
  };
  const datePicker = createDatePicker(calendarHost);
  const panelDatePicker = createDatePicker(datePickerHost);
  const showCalendar = (picker: HTMLInputElement): void => {
    picker.value = parseTaskDate(dueInput.value, forwardOnly.checked).dateKey ?? "";
    picker.showPicker();
  };
  datePickerButton.addEventListener("click", () => showCalendar(panelDatePicker));
  const futureLabel = due.panel.createEl("label", { cls: "tasks-calendar-editor-future" });
  const forwardOnly = futureLabel.createEl("input", { attr: { type: "checkbox" } });
  forwardOnly.checked = true;
  futureLabel.createSpan({ text: "Only future dates" });
  const dueFeedback = due.panel.createDiv({ cls: "tasks-calendar-editor-feedback", attr: { "aria-live": "polite" } });
  addClear(due.panel, "Remove date", dueInput, () => {
    due.close();
    due.summary.focus();
  });

  const recurrence = addEditorPopover(row, "repeat-2", "Recurrence");
  const recurrenceInput = addInput(
    recurrence.panel,
    "Repeat",
    "tasks-calendar-editor-recurs",
    "Every week on Monday",
    model.recurrence,
  );
  recurrence.panel.createDiv({
    cls: "tasks-calendar-editor-hint",
    text: "Use a phrase such as every weekday or every 2 weeks.",
  });
  const recurrenceFeedback = recurrence.panel.createDiv({
    cls: "tasks-calendar-editor-feedback",
    attr: { "aria-live": "polite" },
  });
  addClear(recurrence.panel, "Remove recurrence", recurrenceInput, () => {
    recurrence.close();
    recurrence.summary.focus();
  });

  const priorityButton = row.createEl("button", {
    attr: { type: "button", "aria-label": "Priority", "aria-haspopup": "menu" },
    cls: "tasks-calendar-editor-chip",
  });
  const priorityIcon = priorityButton.createSpan();
  const priorityCaption = priorityButton.createSpan();
  const updatePriority = (): void => {
    const priority = PRIORITIES.find((item) => item.value === model.priority) ?? PRIORITIES[3];
    setIcon(priorityIcon, priorityIconName(priority.value));
    priorityCaption.setText(`${priority.label} priority`);
    priorityButton.dataset.priority = model.priority;
  };
  updatePriority();
  priorityButton.addEventListener("click", () => {
    due.close();
    recurrence.close();
    const menu = new Menu().setUseNativeMenu(false);
    for (const priority of PRIORITIES) {
      menu.addItem((item) =>
        item
          .setTitle(priority.label)
          .setIcon(priorityIconName(priority.value))
          .setChecked(model.priority === priority.value)
          .onClick(() => {
            model.priority = priority.value;
            updatePriority();
            priorityButton.dispatchEvent(new Event("input", { bubbles: true }));
          }),
      );
    }
    const rect = priorityButton.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
  });

  const openCalendar = (): void => {
    due.close();
    recurrence.close();
    showCalendar(datePicker);
  };
  calendarShortcut.addEventListener("click", openCalendar);

  dueInput.addEventListener("blur", () => {
    const result = parseTaskDate(dueInput.value, forwardOnly.checked);
    if (result.dateKey) dueInput.value = result.dateKey;
  });

  return {
    dispose() {
      due.dispose();
      recurrence.dispose();
    },
    openCalendar,
    readState() {
      return { due: dueInput.value, recurrence: recurrenceInput.value, forwardOnly: forwardOnly.checked };
    },
    restoreState(state: { due: string; recurrence: string; forwardOnly: boolean }) {
      dueInput.value = state.due;
      recurrenceInput.value = state.recurrence;
      forwardOnly.checked = state.forwardOnly;
      const date = parseTaskDate(state.due, state.forwardOnly).dateKey ?? "";
      datePicker.value = date;
      panelDatePicker.value = date;
      updatePriority();
    },
    validate() {
      const parsedDate = parseTaskDate(dueInput.value, forwardOnly.checked);
      const parsedRecurrence = validateRecurrence(
        recurrenceInput.value,
        parsedDate.dateKey !== null || model.hasOtherRecurrenceDate,
      );
      due.caption.setText(parsedDate.dateKey ?? (dueInput.value.trim() || "Add date"));
      recurrence.caption.setText(parsedRecurrence.normalized ?? (recurrenceInput.value.trim() || "Add recurrence"));
      due.summary.toggleClass("is-empty", !dueInput.value.trim());
      dateChip.toggleClass("is-empty", !dueInput.value.trim());
      dateChip.toggleClass("is-error", parsedDate.error !== null);
      recurrence.summary.toggleClass("is-empty", !recurrenceInput.value.trim());
      for (const [field, feedback, summary, error] of [
        [dueInput, dueFeedback, due.summary, parsedDate.error],
        [recurrenceInput, recurrenceFeedback, recurrence.summary, parsedRecurrence.error],
      ] as const) {
        field.setAttribute("aria-invalid", String(error !== null));
        feedback.setText(error ?? "");
        feedback.hidden = error === null;
        summary.toggleClass("is-error", error !== null);
      }
      if (parsedDate.dateKey) {
        datePicker.value = parsedDate.dateKey;
        panelDatePicker.value = parsedDate.dateKey;
      }
      return {
        due: parsedDate.dateKey ?? "",
        recurrence: recurrenceInput.value,
        valid: parsedDate.error === null && parsedRecurrence.error === null,
      };
    },
  };
}

function addInput(parent: HTMLElement, label: string, id: string, placeholder: string, value: string) {
  parent.createEl("label", { attr: { for: id }, text: label });
  return parent.createEl("input", { attr: { id, type: "text", autocomplete: "off", placeholder }, value });
}

function addClear(parent: HTMLElement, label: string, input: HTMLInputElement, onClear: () => void) {
  const button = parent.createEl("button", {
    attr: { type: "button" },
    cls: "tasks-calendar-editor-clear",
    text: label,
  });
  button.addEventListener("click", () => {
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    onClear();
  });
}
