import { Keymap, type Workspace } from "obsidian";

export function handleTaskLinkClick(
  event: MouseEvent,
  workspace: Pick<Workspace, "openLinkText">,
  sourcePath: string,
): void {
  if (event.defaultPrevented || (event.button !== 0 && event.button !== 1)) return;

  const link = (event.target as Element).closest("a.internal-link");
  const target = link?.getAttribute("data-href") ?? link?.getAttribute("href");
  if (!target) return;

  event.preventDefault();
  event.stopPropagation();
  void workspace.openLinkText(target, sourcePath, Keymap.isModEvent(event));
}
