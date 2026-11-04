import { Menu, setIcon } from "obsidian";
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
  const due = addPanel(row, "calendar-days", "Due date");
  const dueInput = addInput(due.panel, "Due date", "tasks-calendar-editor-due", "Tomorrow or YYYY-MM-DD", model.due);
  const dueControls = due.panel.createDiv({ cls: "tasks-calendar-editor-date-controls" });
  dueControls.appendChild(dueInput);
  const datePickerHost = dueControls.createDiv({ cls: "tasks-calendar-editor-date-picker-host" });
  const datePickerButton = datePickerHost.createEl("button", {
    attr: { "aria-label": "Choose due date", type: "button" },
    cls: "tasks-calendar-editor-date-picker",
  });
  setIcon(datePickerButton, "calendar-days");
  const datePicker = datePickerHost.createEl("input", {
    attr: { "aria-label": "Due date picker", tabindex: "-1", type: "date" },
    cls: "tasks-calendar-editor-date-picker-input",
  });
  datePickerButton.addEventListener("click", () => datePicker.showPicker());
  datePicker.value = model.due;
  const futureLabel = due.panel.createEl("label", { cls: "tasks-calendar-editor-future" });
  const forwardOnly = futureLabel.createEl("input", { attr: { type: "checkbox" } });
  forwardOnly.checked = true;
  futureLabel.createSpan({ text: "Only future dates" });
  const dueFeedback = due.panel.createDiv({ cls: "tasks-calendar-editor-feedback", attr: { "aria-live": "polite" } });
  addClear(due.panel, "Remove date", dueInput, () => {
    due.close();
    due.summary.focus();
  });

  const recurrence = addPanel(row, "repeat-2", "Recurrence");
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

  datePicker.addEventListener("input", () => {
    dueInput.value = datePicker.value;
  });
  dueInput.addEventListener("blur", () => {
    const result = parseTaskDate(dueInput.value, forwardOnly.checked);
    if (result.dateKey) dueInput.value = result.dateKey;
  });

  return {
    validate() {
      const parsedDate = parseTaskDate(dueInput.value, forwardOnly.checked);
      const parsedRecurrence = validateRecurrence(
        recurrenceInput.value,
        parsedDate.dateKey !== null || model.hasOtherRecurrenceDate,
      );
      due.caption.setText(parsedDate.dateKey ?? (dueInput.value.trim() || "Add date"));
      recurrence.caption.setText(parsedRecurrence.normalized ?? (recurrenceInput.value.trim() || "Add recurrence"));
      due.summary.toggleClass("is-empty", !dueInput.value.trim());
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
      if (parsedDate.dateKey) datePicker.value = parsedDate.dateKey;
      return {
        due: parsedDate.dateKey ?? "",
        recurrence: recurrenceInput.value,
        valid: parsedDate.error === null && parsedRecurrence.error === null,
      };
    },
  };
}

function addPanel(parent: HTMLElement, icon: string, label: string) {
  const summary = parent.createEl("button", {
    cls: "tasks-calendar-editor-chip",
    attr: { type: "button", "aria-label": label, "aria-expanded": "false", "aria-haspopup": "dialog" },
  });
  setIcon(summary.createSpan(), icon);
  const caption = summary.createSpan();
  const panel = parent.createDiv({
    cls: "tasks-calendar-editor-property-panel",
    attr: { popover: "auto", role: "dialog", "aria-label": label },
  });
  const close = (): void => {
    if (panel.matches(":popover-open")) panel.hidePopover();
  };
  summary.addEventListener("click", () => {
    if (panel.matches(":popover-open")) {
      close();
      return;
    }
    const rect = summary.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - 32);
    panel.style.width = `${width}px`;
    panel.style.left = `${Math.max(16, Math.min(rect.left, window.innerWidth - width - 16))}px`;
    panel.showPopover();
    const height = panel.getBoundingClientRect().height;
    panel.style.top = `${Math.max(16, Math.min(rect.bottom + 8, window.innerHeight - height - 16))}px`;
    panel.querySelector("input")?.focus();
  });
  panel.addEventListener("toggle", () => {
    const open = panel.matches(":popover-open");
    summary.setAttribute("aria-expanded", String(open));
  });
  panel.addEventListener("keydown", (event) => {
    const confirmsInput = event.key === "Enter" && event.target instanceof HTMLInputElement;
    if ((event.key !== "Escape" && !confirmsInput) || event.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    close();
    summary.focus();
  });
  return { summary, caption, panel, close };
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
