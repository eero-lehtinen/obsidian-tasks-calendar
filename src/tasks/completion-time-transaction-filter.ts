import { EditorState, type Extension, type Transaction } from "@codemirror/state";
import { addCompletionTime, currentLocalTime, removeCompletionTime } from "./completion-time";
import { parseTaskLine } from "./parser";

interface LineChange {
  from: number;
  to: number;
  insert: string;
}

export function createCompletionTimeTransactionFilter(
  getCompletionTime: () => string = currentLocalTime,
  shouldRecordCompletionTime: () => boolean = () => true,
): Extension {
  return EditorState.transactionFilter.of((transaction) => {
    if (!transaction.docChanged || !shouldRecordCompletionTime()) return transaction;

    const changes = completionTimeChanges(transaction, getCompletionTime());
    if (changes.length === 0) return transaction;

    console.info(`Tasks Calendar: synchronously recorded ${changes.length} task checkbox change(s).`);
    return [transaction, { changes, sequential: true }];
  });
}

function completionTimeChanges(transaction: Transaction, completionTime: string): LineChange[] {
  const changes = new Map<number, LineChange>();

  transaction.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    const oldLines = linesInRange(transaction.startState.doc, fromA, toA);
    const newLines = linesInRange(transaction.newDoc, fromB, toB);

    for (const oldLine of oldLines) {
      const oldTask = parseTaskLine(oldLine.text, "", oldLine.number - 1);
      if (!oldTask) continue;

      if (!oldTask.completed) {
        const completedLine = newLines.find((line) => parseTaskLine(line.text, "", line.number - 1)?.completed);
        if (completedLine) {
          addLineChange(
            changes,
            completedLine.from,
            completedLine.to,
            addCompletionTime(completedLine.text, completionTime),
          );
        }
      } else if (oldTask.completionTime !== null) {
        const reopenedLine = newLines.find((line) => {
          const task = parseTaskLine(line.text, "", line.number - 1);
          return task !== null && !task.completed;
        });
        if (reopenedLine) {
          addLineChange(changes, reopenedLine.from, reopenedLine.to, removeCompletionTime(reopenedLine.text));
        }
      }
    }
  });

  return Array.from(changes.values()).filter(
    (change) => transaction.newDoc.sliceString(change.from, change.to) !== change.insert,
  );
}

function linesInRange(document: Transaction["newDoc"], from: number, to: number) {
  const startLine = document.lineAt(from);
  const endLine = document.lineAt(Math.max(from, to - 1));
  const lines = [];
  for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber += 1) {
    lines.push(document.line(lineNumber));
  }
  return lines;
}

function addLineChange(changes: Map<number, LineChange>, from: number, to: number, insert: string): void {
  changes.set(from, { from, to, insert });
}
