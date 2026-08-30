import { type App, Modal, setIcon } from "obsidian";
import {
  parseTaskDate,
  type TaskEditorModel,
  type TaskPriority,
  taskEditorModelFromLine,
  taskLineFromEditorModel,
  validateRecurrence,
} from "./task-editor-model";

const PRIORITIES: { value: TaskPriority; label: string; marker: string }[] = [
  { value: "lowest", label: "Lowest", marker: "⏬" },
  { value: "low", label: "Low", marker: "🔽" },
  { value: "normal", label: "Normal", marker: "—" },
  { value: "medium", label: "Medium", marker: "🔼" },
  { value: "high", label: "High", marker: "⏫" },
  { value: "highest", label: "Highest", marker: "🔺" },
];
const COMPLETED_STATUSES = new Set(["x", "X", "-", "_"]);

interface TaskEditorOptions {
  mode: "create" | "edit";
  source?: {
    path: string;
    line: number;
    open: () => Promise<void>;
    delete: () => Promise<boolean>;
  };
}

export function openTaskEditor(app: App, taskLine: string, options: TaskEditorOptions): Promise<string | null> {
  return new Promise((resolve) => {
    new TaskEditorModal(app, taskLine, options, resolve).open();
  });
}

class TaskEditorModal extends Modal {
  private readonly model: TaskEditorModel;
  private settled = false;

  constructor(
    app: App,
    taskLine: string,
    private readonly options: TaskEditorOptions,
    private readonly resolveResult: (result: string | null) => void,
  ) {
    super(app);
    this.model = taskEditorModelFromLine(taskLine);
  }

  override onOpen(): void {
    this.titleEl.setText(this.options.mode === "create" ? "Create task" : "Edit task");
    this.modalEl.addClass("tasks-calendar-editor-modal");
    this.contentEl.empty();

    const form = this.contentEl.createEl("form", { cls: "tasks-calendar-editor" });
    this.addSourceActions(form);
    this.addStatus(form);
    const description = this.addDescription(form);
    this.addPriorityPicker(form);

    const fields = form.createDiv({ cls: "tasks-calendar-editor-fields" });
    const recurrence = this.addTextField(fields, "Recurs", "Try “every week on Monday”", this.model.recurrence);
    recurrence.input.autocomplete = "off";
    const recurrenceFeedback = recurrence.row.createDiv({ cls: "tasks-calendar-editor-feedback" });

    const dueRow = fields.createDiv({ cls: "tasks-calendar-editor-field" });
    dueRow.createEl("label", { attr: { for: "tasks-calendar-editor-due" }, text: "Due" });
    const dueControls = dueRow.createDiv({ cls: "tasks-calendar-editor-date-controls" });
    const dueInput = dueControls.createEl("input", {
      attr: { autocomplete: "off", id: "tasks-calendar-editor-due", placeholder: "YYYY-MM-DD or “thu”", type: "text" },
      value: this.model.due,
    });
    const datePickerHost = dueControls.createDiv({ cls: "tasks-calendar-editor-date-picker-host" });
    const datePickerButton = datePickerHost.createEl("button", {
      attr: { "aria-label": "Choose due date", type: "button" },
      cls: "tasks-calendar-editor-date-picker",
    });
    datePickerButton.type = "button";
    setIcon(datePickerButton, "calendar-days");
    const datePicker = datePickerHost.createEl("input", {
      attr: { "aria-label": "Due date picker", tabindex: "-1", type: "date" },
      cls: "tasks-calendar-editor-date-picker-input",
    });
    datePicker.value = this.model.due;
    const dueFeedback = dueRow.createDiv({ cls: "tasks-calendar-editor-feedback" });

    const futureRow = fields.createEl("label", { cls: "tasks-calendar-editor-future" });
    const forwardOnly = futureRow.createEl("input", { attr: { type: "checkbox" } });
    forwardOnly.checked = true;
    futureRow.createSpan({ text: "Only future dates" });

    const actions = form.createDiv({ cls: "tasks-calendar-editor-actions" });
    const apply = actions.createEl("button", { attr: { type: "submit" }, cls: "mod-cta", text: "Apply" });
    apply.type = "submit";
    const cancel = actions.createEl("button", { attr: { type: "button" }, text: "Cancel" });
    cancel.type = "button";

    const validate = (): void => {
      const parsedDate = parseTaskDate(dueInput.value, forwardOnly.checked);
      dueInput.toggleClass("is-invalid", parsedDate.error !== null);
      dueFeedback.setText(parsedDate.error ?? (parsedDate.dateKey ? formatDatePreview(parsedDate.dateKey) : ""));
      dueFeedback.toggleClass("is-error", parsedDate.error !== null);
      if (parsedDate.dateKey) datePicker.value = parsedDate.dateKey;

      const recurrenceResult = validateRecurrence(
        recurrence.input.value,
        parsedDate.dateKey !== null || this.model.hasOtherRecurrenceDate,
      );
      recurrence.input.toggleClass("is-invalid", recurrenceResult.error !== null);
      recurrenceFeedback.setText(recurrenceResult.error ?? recurrenceResult.normalized ?? "Not recurring");
      recurrenceFeedback.toggleClass("is-error", recurrenceResult.error !== null);

      apply.disabled =
        description.value.trim().length === 0 || parsedDate.error !== null || recurrenceResult.error !== null;
    };

    description.addEventListener("input", validate);
    dueInput.addEventListener("input", validate);
    dueInput.addEventListener("blur", () => {
      const result = parseTaskDate(dueInput.value, forwardOnly.checked);
      if (result.dateKey) dueInput.value = result.dateKey;
      validate();
    });
    datePicker.addEventListener("input", () => {
      dueInput.value = datePicker.value;
      validate();
    });
    datePickerButton.addEventListener("click", (event) => {
      event.preventDefault();
      datePicker.showPicker();
    });
    forwardOnly.addEventListener("change", validate);
    recurrence.input.addEventListener("input", validate);
    cancel.addEventListener("click", (event) => {
      event.preventDefault();
      this.close();
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      validate();
      if (apply.disabled) return;
      const due = parseTaskDate(dueInput.value, forwardOnly.checked).dateKey;
      this.model.description = description.value;
      this.model.recurrence = recurrence.input.value;
      this.model.due = due ?? "";
      this.finish(taskLineFromEditorModel(this.model));
    });

    validate();
    window.setTimeout(() => description.focus({ preventScroll: true }), 0);
  }

  override onClose(): void {
    this.contentEl.empty();
    this.finish(null);
  }

  private addDescription(form: HTMLFormElement): HTMLTextAreaElement {
    const section = form.createEl("section", { cls: "tasks-calendar-editor-description" });
    section.createEl("label", { attr: { for: "tasks-calendar-editor-description" }, text: "Description" });
    const input = section.createEl("textarea", {
      attr: { id: "tasks-calendar-editor-description", placeholder: "What needs to be done?", rows: "3" },
      text: this.model.description,
    });
    input.value = this.model.description;
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        input.form?.requestSubmit();
      }
    });
    return input;
  }

  private addPriorityPicker(form: HTMLFormElement): void {
    const section = form.createEl("fieldset", { cls: "tasks-calendar-editor-priority" });
    section.createEl("legend", { text: "Priority" });
    const options = section.createDiv({ cls: "tasks-calendar-editor-priority-options" });
    for (const priority of PRIORITIES) {
      const label = options.createEl("label", { attr: { "data-priority": priority.value } });
      const radio = label.createEl("input", { attr: { name: "priority", type: "radio", value: priority.value } });
      radio.checked = this.model.priority === priority.value;
      radio.addEventListener("change", () => {
        if (radio.checked) this.model.priority = priority.value;
      });
      label.createSpan({ cls: "tasks-calendar-editor-priority-marker", text: priority.marker });
      label.createSpan({ text: priority.label });
    }
  }

  private addTextField(parent: HTMLElement, labelText: string, placeholder: string, value: string) {
    const row = parent.createDiv({ cls: "tasks-calendar-editor-field" });
    const id = `tasks-calendar-editor-${labelText.toLowerCase()}`;
    row.createEl("label", { attr: { for: id }, text: labelText });
    const input = row.createEl("input", { attr: { id, placeholder, type: "text" }, value });
    return { input, row };
  }

  private addStatus(form: HTMLFormElement): void {
    const section = form.createEl("section", { cls: "tasks-calendar-editor-status" });
    section.createSpan({ cls: "tasks-calendar-editor-status-label", text: "Status" });
    const label = section.createEl("label");
    const checkbox = label.createEl("input", { attr: { type: "checkbox" } });
    checkbox.checked = COMPLETED_STATUSES.has(this.model.status);
    label.createSpan({ text: "Completed" });
    if (this.model.done || this.model.completionTime) {
      const details = [this.model.done, this.model.completionTime ? `🕒 ${this.model.completionTime}` : ""]
        .filter(Boolean)
        .join(" · ");
      label.createSpan({ text: `· ${details}` });
    }
    checkbox.addEventListener("change", () => {
      this.model.status = checkbox.checked ? "x" : " ";
    });
  }

  private addSourceActions(form: HTMLFormElement): void {
    const source = this.options.source;
    if (!source) return;

    const row = form.createDiv({ cls: "tasks-calendar-editor-source-actions" });
    const sourceLink = row.createEl("a", {
      attr: { "aria-label": `Open ${source.path} at line ${source.line}`, href: "#" },
      cls: "tasks-calendar-editor-source",
    });
    setIcon(sourceLink, "file-text");
    sourceLink.createSpan({ text: `${source.path} · line ${source.line}` });
    sourceLink.addEventListener("click", (event) => {
      event.preventDefault();
      this.close();
      void source.open();
    });

    const deleteButton = row.createEl("button", {
      attr: { type: "button" },
      cls: "tasks-calendar-editor-delete",
      text: "Delete task",
    });
    deleteButton.type = "button";
    deleteButton.addEventListener("click", (event) => {
      event.preventDefault();
      void confirmTaskDeletion(this.app).then((confirmed) => {
        if (!confirmed) return;
        deleteButton.disabled = true;
        deleteButton.setText("Deleting…");
        void source.delete().then((deleted) => {
          if (deleted) {
            this.close();
            return;
          }
          deleteButton.disabled = false;
          deleteButton.setText("Delete task");
        });
      });
    });
  }

  private finish(result: string | null): void {
    if (this.settled) return;
    this.settled = true;
    this.resolveResult(result);
    if (result !== null) this.close();
  }
}

function confirmTaskDeletion(app: App): Promise<boolean> {
  return new Promise((resolve) => new DeleteTaskConfirmationModal(app, resolve).open());
}

class DeleteTaskConfirmationModal extends Modal {
  private settled = false;

  constructor(
    app: App,
    private readonly resolveResult: (confirmed: boolean) => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.titleEl.setText("Delete task?");
    this.contentEl.createEl("p", { text: "This will remove the task from its source note." });
    const actions = this.contentEl.createDiv({ cls: "tasks-calendar-editor-confirm-actions" });
    const cancel = actions.createEl("button", { attr: { type: "button" }, text: "Cancel" });
    cancel.type = "button";
    const remove = actions.createEl("button", {
      attr: { type: "button" },
      cls: "mod-warning",
      text: "Delete",
    });
    remove.type = "button";
    cancel.addEventListener("click", () => this.close());
    remove.addEventListener("click", () => this.finish(true));
    window.setTimeout(() => cancel.focus({ preventScroll: true }), 0);
  }

  override onClose(): void {
    this.contentEl.empty();
    this.finish(false);
  }

  private finish(confirmed: boolean): void {
    if (this.settled) return;
    this.settled = true;
    this.resolveResult(confirmed);
    if (confirmed) this.close();
  }
}

function formatDatePreview(dateKey: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(new Date(`${dateKey}T00:00:00`));
}
