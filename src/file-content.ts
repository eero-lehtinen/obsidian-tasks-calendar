export function insertTaskAtTop(content: string, taskLine: string): string {
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  if (content.length === 0) return `${taskLine}${newline}`;

  const lines = content.split(/\r?\n/);
  let insertionIndex = 0;
  if (lines[0].trim() === "---") {
    const frontmatterEnd = lines.findIndex(
      (line, index) => index > 0 && (line.trim() === "---" || line.trim() === "..."),
    );
    if (frontmatterEnd > 0) insertionIndex = frontmatterEnd + 1;
  }

  lines.splice(insertionIndex, 0, taskLine);
  return lines.join(newline);
}

export function deleteTaskLine(content: string, taskLine: string, expectedLineNumber: number): string {
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(/\r?\n/);
  const lineNumber = lines[expectedLineNumber] === taskLine ? expectedLineNumber : lines.indexOf(taskLine);
  if (lineNumber === -1) throw new Error("The task changed before it could be deleted.");

  lines.splice(lineNumber, 1);
  return lines.join(newline);
}
