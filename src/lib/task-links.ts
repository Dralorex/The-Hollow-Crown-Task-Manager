const TASK_LINK_RE = /#task:([a-z0-9]+)/gi;

export type TaskLinkInfo = {
  id: string;
  name: string;
  href: string;
};

export type MessagePart =
  | { type: "text"; text: string }
  | { type: "mention"; text: string }
  | { type: "task"; text: string; taskId: string; href?: string; name?: string };

const MENTION_RE = /@([A-Za-z0-9_]+)/g;

/** Extract unique task ids referenced as #task:id */
export function parseTaskLinkIds(body: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const match of body.matchAll(TASK_LINK_RE)) {
    const id = match[1];
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Split message into text / @mentions / #task:id parts for rich rendering.
 * Mentions and task links are scanned left-to-right.
 */
export function highlightMessageParts(
  body: string,
  taskMap?: Record<string, TaskLinkInfo>,
): MessagePart[] {
  type Hit = { start: number; end: number; part: MessagePart };
  const hits: Hit[] = [];

  for (const match of body.matchAll(MENTION_RE)) {
    const start = match.index ?? 0;
    hits.push({
      start,
      end: start + match[0].length,
      part: { type: "mention", text: match[0] },
    });
  }

  for (const match of body.matchAll(TASK_LINK_RE)) {
    const start = match.index ?? 0;
    const taskId = match[1];
    const info = taskMap?.[taskId];
    hits.push({
      start,
      end: start + match[0].length,
      part: {
        type: "task",
        text: info ? `#${info.name}` : match[0],
        taskId,
        href: info?.href,
        name: info?.name,
      },
    });
  }

  hits.sort((a, b) => a.start - b.start || b.end - a.end);

  const parts: MessagePart[] = [];
  let cursor = 0;
  for (const hit of hits) {
    if (hit.start < cursor) continue; // overlap
    if (hit.start > cursor) {
      parts.push({ type: "text", text: body.slice(cursor, hit.start) });
    }
    parts.push(hit.part);
    cursor = hit.end;
  }
  if (cursor < body.length) {
    parts.push({ type: "text", text: body.slice(cursor) });
  }
  return parts.length ? parts : [{ type: "text", text: body }];
}

export function taskInsertToken(taskId: string) {
  return `#task:${taskId}`;
}

export function toTaskOption(task: {
  id: string;
  name: string;
  workspace: { name: string };
}) {
  return {
    id: task.id,
    name: task.name,
    workspaceName: task.workspace.name,
    insert: taskInsertToken(task.id),
  };
}
