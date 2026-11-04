import { EditorHistory } from "./editor-history";
import type { addTaskMetadata } from "./editor-metadata";
import type { TaskEditorModel } from "./task-editor-model";

export function registerEditorUndo(
  form: HTMLFormElement,
  description: HTMLTextAreaElement,
  metadata: ReturnType<typeof addTaskMetadata>,
  model: TaskEditorModel,
): void {
  const textFields = Array.from(
    form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[type="text"], textarea'),
  );
  const readState = () => ({
    values: {
      description: description.value,
      status: model.status,
      priority: model.priority,
      ...metadata.readState(),
    },
    selections: textFields.map((field) => ({
      start: field.selectionStart ?? 0,
      end: field.selectionEnd ?? 0,
      direction: field.selectionDirection ?? "none",
    })),
  });
  const history = new EditorHistory(readState(), (a, b) => JSON.stringify(a.values) === JSON.stringify(b.values));
  let restoring = false;
  const record = (event: Event): void => {
    if (restoring) return;
    const target = event.target;
    const typing =
      event instanceof InputEvent &&
      (target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && target.type === "text"));
    history.record(readState(), typing ? `${target.id}:${event.inputType}` : undefined);
  };
  form.addEventListener("beforeinput", () => {
    if (!restoring) history.updateCurrent(readState());
  });
  form.addEventListener("pointerdown", () => history.breakGroup());
  form.addEventListener("input", record);
  form.addEventListener("change", record);
  form.addEventListener("focusin", () => history.breakGroup());
  form.addEventListener("keydown", (event) => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
      history.breakGroup();
    }
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing) return;
    const key = event.key.toLowerCase();
    if (key !== "z" && key !== "y") return;
    event.preventDefault();
    event.stopPropagation();
    history.updateCurrent(readState());
    const state = key === "y" || event.shiftKey ? history.redo() : history.undo();
    if (!state) return;
    restoring = true;
    try {
      description.value = state.values.description;
      model.status = state.values.status;
      model.priority = state.values.priority;
      metadata.restoreState(state.values);
      description.dispatchEvent(new Event("input", { bubbles: true }));
      textFields.forEach((field, index) => {
        const selection = state.selections[index];
        if (selection) field.setSelectionRange(selection.start, selection.end, selection.direction);
      });
    } finally {
      restoring = false;
    }
  });
}
