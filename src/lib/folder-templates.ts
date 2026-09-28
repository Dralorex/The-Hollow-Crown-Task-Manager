export type FolderTemplateNode = {
  name: string;
  children?: FolderTemplateNode[];
};

export type BuiltInFolderTemplate = {
  id: string;
  name: string;
  description: string;
  tree: FolderTemplateNode[];
};

export const BUILTIN_FOLDER_TEMPLATES: BuiltInFolderTemplate[] = [
  {
    id: "builtin:simple",
    name: "Simple",
    description: "One General bucket to start claiming work.",
    tree: [{ name: "General" }],
  },
  {
    id: "builtin:project",
    name: "Project",
    description: "Planning → Build → Launch.",
    tree: [
      { name: "Planning" },
      { name: "Build" },
      { name: "Launch" },
    ],
  },
  {
    id: "builtin:team",
    name: "Team",
    description: "General plus Requests and nested Projects.",
    tree: [
      { name: "General" },
      { name: "Requests" },
      {
        name: "Projects",
        children: [{ name: "Active" }, { name: "Backlog" }],
      },
    ],
  },
];

export function getBuiltinTemplate(id: string) {
  return BUILTIN_FOLDER_TEMPLATES.find((t) => t.id === id) ?? null;
}

export function parseTemplateTree(raw: string): FolderTemplateNode[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const walk = (nodes: unknown[]): FolderTemplateNode[] | null => {
      const out: FolderTemplateNode[] = [];
      for (const node of nodes) {
        if (!node || typeof node !== "object") return null;
        const name = String((node as { name?: unknown }).name ?? "").trim();
        if (!name) return null;
        const childrenRaw = (node as { children?: unknown }).children;
        let children: FolderTemplateNode[] | undefined;
        if (childrenRaw != null) {
          if (!Array.isArray(childrenRaw)) return null;
          const parsedChildren = walk(childrenRaw);
          if (!parsedChildren) return null;
          children = parsedChildren;
        }
        out.push(children?.length ? { name, children } : { name });
      }
      return out;
    };
    return walk(parsed);
  } catch {
    return null;
  }
}

export function serializeTemplateTree(tree: FolderTemplateNode[]) {
  return JSON.stringify(tree);
}

export function folderRowsToTree(
  folders: { id: string; name: string; parentId: string | null }[],
  rootParentId: string | null = null,
): FolderTemplateNode[] {
  const byParent = new Map<string | null, typeof folders>();
  for (const f of folders) {
    const list = byParent.get(f.parentId) ?? [];
    list.push(f);
    byParent.set(f.parentId, list);
  }
  const build = (parentId: string | null): FolderTemplateNode[] => {
    const kids = byParent.get(parentId) ?? [];
    return kids
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((f) => {
        const children = build(f.id);
        return children.length ? { name: f.name, children } : { name: f.name };
      });
  };
  return build(rootParentId);
}

export function describeTree(tree: FolderTemplateNode[]): string {
  const names: string[] = [];
  const walk = (nodes: FolderTemplateNode[], depth: number) => {
    for (const n of nodes) {
      names.push(`${"—".repeat(depth)}${n.name}`);
      if (n.children?.length) walk(n.children, depth + 1);
    }
  };
  walk(tree, 0);
  return names.join(" · ");
}
