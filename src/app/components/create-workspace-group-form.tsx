"use client";

import { useMemo, useState } from "react";
import { InlineActionForm } from "@/app/components/forms";
import { ChatSidebarSection } from "@/app/components/chat-sidebar-section";
import {
  FriendInvitePicker,
  type InviteFriendOption,
} from "@/app/components/friend-invite-picker";
import { createGroupChatAction } from "@/app/actions/social";

type WorkspaceOption = { id: string; name: string };

/** Create a workspace group with a member picker for the selected workspace. */
export function CreateWorkspaceGroupForm({
  workspaces,
  membersByWorkspace,
}: {
  workspaces: WorkspaceOption[];
  membersByWorkspace: Record<string, InviteFriendOption[]>;
}) {
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");

  const members = useMemo(
    () => membersByWorkspace[workspaceId] ?? [],
    [membersByWorkspace, workspaceId],
  );

  if (workspaces.length === 0) return null;

  return (
    <ChatSidebarSection
      title="New workspace group (Admin+)"
      description="Pick a workspace, then choose members from that workspace."
    >
      <InlineActionForm
        className="flex flex-col gap-2"
        action={createGroupChatAction}
        submitLabel="Create workspace group"
      >
        <select
          name="workspaceId"
          className="rowgon-input text-sm"
          required
          value={workspaceId}
          onChange={(e) => setWorkspaceId(e.target.value)}
        >
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.name}
            </option>
          ))}
        </select>
        <input
          name="name"
          required
          placeholder="Group name"
          className="rowgon-input text-sm"
        />
        <FriendInvitePicker
          key={workspaceId}
          friends={members}
          mode="multi"
          membersName="members"
          required={false}
          searchPlaceholder="Search members"
          selectedItemNoun="member"
          emptyMessage="No other members in this workspace yet."
        />
      </InlineActionForm>
    </ChatSidebarSection>
  );
}
