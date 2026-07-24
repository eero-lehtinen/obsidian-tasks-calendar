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
