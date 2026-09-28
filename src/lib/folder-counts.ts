/** Direct task counts per folder, then roll up to include all descendants. */
export function computeFolderTaskCounts(
  folders: { id: string; parentId: string | null }[],
  directCounts: Map<string, number> | Record<string, number>,
): Map<string, number> {
  const getDirect = (id: string) =>
    directCounts instanceof Map
      ? (directCounts.get(id) ?? 0)
      : (directCounts[id] ?? 0);

  const children = new Map<string, string[]>();
  for (const f of folders) {
    if (!f.parentId) continue;
    const list = children.get(f.parentId) ?? [];
    list.push(f.id);
    children.set(f.parentId, list);
  }

  const totals = new Map<string, number>();

  function total(id: string): number {
    const cached = totals.get(id);
    if (cached !== undefined) return cached;
    let n = getDirect(id);
    for (const childId of children.get(id) ?? []) {
      n += total(childId);
    }
    totals.set(id, n);
    return n;
  }

  for (const f of folders) total(f.id);
  return totals;
}

/** Folder id plus all descendant folder ids, optionally limited to an accessible set. */
export function collectSubtreeFolderIds(
  rootId: string | null,
  folders: { id: string; parentId: string | null }[],
  accessible?: Set<string>,
): string[] {
  if (!rootId) {
    return accessible ? [...accessible] : folders.map((f) => f.id);
  }

  const children = new Map<string, string[]>();
  for (const f of folders) {
    if (!f.parentId) continue;
    const list = children.get(f.parentId) ?? [];
    list.push(f.id);
    children.set(f.parentId, list);
  }

  const out: string[] = [];
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (accessible && !accessible.has(id)) continue;
    out.push(id);
    for (const childId of children.get(id) ?? []) {
      stack.push(childId);
    }
  }
  return out;
}
