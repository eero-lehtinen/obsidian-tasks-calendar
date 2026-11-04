import { type App, Modal, setIcon } from "obsidian";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { sourceOffsetAtRenderedPosition, type TaskTextPosition } from "./editor-caret";
import { addTaskMetadata } from "./editor-metadata";
import { TaskEditorPreview } from "./editor-preview";
import { registerEditorUndo } from "./editor-undo";
import { parseTaskLine } from "./parser";
import {
  completionDateLabel,
  type TaskEditorModel,
  taskEditorModelFromLine,
  taskLineFromEditorModel,
} from "./task-editor-model";

interface TaskEditorOptions {
  mode: "create" | "edit";
  completedOpacity: number;
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
  private descriptionPreviewRoot: Root | undefined;

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
    const description = this.addDescription(form);
    this.addSourceLink(form);
    const metadata = addTaskMetadata(form, this.model);

    const actions = form.createDiv({ cls: "tasks-calendar-editor-actions" });
    this.addDeleteAction(actions);
    const buttons = actions.createDiv({ cls: "tasks-calendar-editor-save-actions" });
    const cancel = buttons.createEl("button", {
      attr: { type: "button" },
      cls: "tasks-calendar-editor-cancel",
      text: "Cancel",
    });
    const apply = buttons.createEl("button", { attr: { type: "submit" }, cls: "mod-cta", text: "Save" });
    const validate = (): void => {
      const result = metadata.validate();
      apply.disabled = description.value.trim().length === 0 || !result.valid;
    };
    form.addEventListener("input", validate);
    form.addEventListener("change", validate);
    cancel.addEventListener("click", () => this.close());
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      validate();
      if (apply.disabled) return;
      const result = metadata.validate();
      this.model.description = description.value;
      this.model.recurrence = result.recurrence;
      this.model.due = result.due;
      this.finish(taskLineFromEditorModel(this.model));
    });
    validate();
    registerEditorUndo(form, description, metadata, this.model);
  }

  override onClose(): void {
    this.descriptionPreviewRoot?.unmount();
    this.descriptionPreviewRoot = undefined;
    this.contentEl.empty();
    this.finish(null);
  }

  private addDescription(form: HTMLFormElement): HTMLTextAreaElement {
    const section = form.createEl("section", { cls: "tasks-calendar-editor-description" });
    const preview = section.createDiv({
      cls: "tasks-calendar-editor-preview",
    });
    const taskPreview = preview.createDiv();
    this.descriptionPreviewRoot = createRoot(taskPreview);
    const sourcePath = this.options.source?.path ?? "";
    if (this.model.done || this.model.completionTime) {
      const details = [
        completionDateLabel(this.model.done),
        this.model.completionTime ? `🕒 ${this.model.completionTime}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      section.createDiv({ cls: "tasks-calendar-editor-completion-details", text: details });
    }
    const input = section.createEl("textarea", {
      attr: {
        "aria-label": "Task description",
        id: "tasks-calendar-editor-description",
        placeholder: "Task",
        rows: "1",
      },
      text: this.model.description,
    });
    input.value = this.model.description;
    const resizeInput = (): void => {
      const title = preview.querySelector<HTMLElement>(".tasks-calendar-task-title");
      if (!title || input.hidden) return;
      const sectionRect = section.getBoundingClientRect();
      const titleRect = title.getBoundingClientRect();
      input.style.left = `${titleRect.left - sectionRect.left}px`;
      input.style.top = `${titleRect.top - sectionRect.top}px`;
      input.style.width = `${titleRect.width}px`;
      input.style.height = "0px";
      const border =
        parseFloat(getComputedStyle(input).borderTopWidth) + parseFloat(getComputedStyle(input).borderBottomWidth);
      const height = input.scrollHeight + border;
      input.style.height = `${height}px`;
      title.style.height = `${height}px`;
    };
    const beginEditing = (position?: TaskTextPosition): void => {
      const title = preview.querySelector<HTMLElement>(".tasks-calendar-task-title");
      if (!title) {
        if (section.isConnected) window.requestAnimationFrame(() => beginEditing(position));
        return;
      }
      input.hidden = false;
      preview.addClass("is-editing");
      title.setAttribute("aria-hidden", "true");
      title.tabIndex = -1;
      resizeInput();
      input.focus({ preventScroll: true });
      const offset = position ? sourceOffsetAtRenderedPosition(input.value, position) : input.value.length;
      input.setSelectionRange(offset, offset);
    };
    input.hidden = true;
    input.addEventListener("input", resizeInput);
    input.addEventListener("blur", () => {
      input.hidden = true;
      preview.removeClass("is-editing");
      const title = preview.querySelector<HTMLElement>(".tasks-calendar-task-title");
      if (title) {
        title.style.height = "";
        title.removeAttribute("aria-hidden");
        title.tabIndex = 0;
      }
    });
    const updatePreview = (): void => {
      const recurrence = form.querySelector<HTMLInputElement>("#tasks-calendar-editor-recurs")?.value;
      const task = parseTaskLine(
        taskLineFromEditorModel({
          ...this.model,
          description: input.value,
          recurrence: recurrence ?? this.model.recurrence,
        }),
        sourcePath,
        this.options.source?.line ?? 0,
      );
      if (!task) return;
      this.descriptionPreviewRoot?.render(
        createElement(TaskEditorPreview, {
          app: this.app,
          completedOpacity: this.options.completedOpacity,
          task,
          onCompletionChange: (completed: boolean) => {
            this.model.status = completed ? "x" : " ";
            updatePreview();
          },
          onEdit: beginEditing,
        }),
      );
    };
    form.addEventListener("input", updatePreview);
    form.addEventListener("change", updatePreview);
    updatePreview();
    if (this.options.mode === "create") window.setTimeout(beginEditing, 0);
    input.addEventListener("keydown", (event) => {
      if (event.isComposing) return;
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        input.blur();
        preview.querySelector<HTMLElement>(".tasks-calendar-task-title")?.focus();
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        input.blur();
        preview.querySelector<HTMLElement>(".tasks-calendar-task-title")?.focus();
      }
    });
    return input;
  }

  private addSourceLink(form: HTMLFormElement): void {
    const source = this.options.source;
    if (!source) return;

    const sourceLink = form.createEl("a", {
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
  }

  private addDeleteAction(actions: HTMLElement): void {
    const source = this.options.source;
    if (!source) return;
    const deleteButton = actions.createEl("button", {
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
