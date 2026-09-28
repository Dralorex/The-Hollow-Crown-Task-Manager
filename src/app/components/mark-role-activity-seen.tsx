"use client";

import { useEffect } from "react";
import { markRoleActivitySeenAction } from "@/app/actions/roles";

/** Marks role activity as seen when the user opens a matching folder. */
export function MarkRoleActivitySeen({
  workspaceId,
  roleIds,
}: {
  workspaceId: string;
  roleIds: string[];
}) {
  useEffect(() => {
    if (roleIds.length === 0) return;
    const fd = new FormData();
    fd.set("workspaceId", workspaceId);
    for (const id of roleIds) fd.append("roleId", id);
    void markRoleActivitySeenAction(null, fd);
  }, [workspaceId, roleIds.join(",")]);

  return null;
}
