"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { markRoleActivitySeenAction } from "@/app/actions/roles";

export function RoleActivityNotices({
  workspaceId,
  items,
}: {
  workspaceId: string;
  items: { roleId: string; roleName: string; count: number }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (items.length === 0) return null;

  function markOne(roleId: string) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("workspaceId", workspaceId);
      fd.append("roleId", roleId);
      await markRoleActivitySeenAction(null, fd);
      router.refresh();
    });
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={item.roleId}
          className="rowgon-panel flex flex-wrap items-center justify-between gap-3 px-4 py-3"
        >
          <p className="text-sm text-[color:var(--rowgon-deep)]">
            <span className="font-semibold">
              {item.count} task{item.count === 1 ? "" : "s"}
            </span>{" "}
            {item.count === 1 ? "has" : "have"} been added for{" "}
            <span className="font-semibold">{item.roleName}</span>
          </p>
          <button
            type="button"
            disabled={pending}
            className="rowgon-btn-secondary !px-3 !py-1.5 text-xs disabled:opacity-50"
            onClick={() => markOne(item.roleId)}
          >
            Mark seen
          </button>
        </li>
      ))}
    </ul>
  );
}
