/** Nested folder picker options for move / reparent menus. */

export type FolderMoveOption = {
  /** `null` = workspace root (top level). */
  id: string | null;
  label: string;
};

export function buildNestedFolderOptions(
  folders: { id: string; name: string; parentId: string | null }[],
  opts?: {
    /** Folders to omit (e.g. self + descendants when moving a folder). */
    excludeIds?: Iterable<string>;
    includeRoot?: boolean;
    rootLabel?: string;
  },
): FolderMoveOption[] {
  const exclude = new Set(opts?.excludeIds ?? []);
  const includeRoot = opts?.includeRoot ?? true;
  const byParent = new Map<string | null, { id: string; name: string }[]>();

  for (const f of folders) {
    if (exclude.has(f.id)) continue;
    const list = byParent.get(f.parentId) ?? [];
    list.push({ id: f.id, name: f.name });
    byParent.set(f.parentId, list);
  }

  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  const out: FolderMoveOption[] = [];
  if (includeRoot) {
    out.push({
      id: null,
      label: opts?.rootLabel ?? "Workspace root (top level)",
    });
  }

  const walk = (parentId: string | null, depth: number) => {
    for (const child of byParent.get(parentId) ?? []) {
      const indent = depth > 0 ? `${"·· ".repeat(depth)}` : "";
      out.push({ id: child.id, label: `${indent}${child.name}` });
      walk(child.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Collect a folder and every descendant id (for cycle-safe moves). */
export function collectDescendantIds(
  folders: { id: string; parentId: string | null }[],
  rootId: string,
): Set<string> {
  const byParent = new Map<string | null, string[]>();
  for (const f of folders) {
    const list = byParent.get(f.parentId) ?? [];
    list.push(f.id);
    byParent.set(f.parentId, list);
  }
  const ids = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (ids.has(id)) continue;
    ids.add(id);
    for (const child of byParent.get(id) ?? []) stack.push(child);
  }
  return ids;
}
