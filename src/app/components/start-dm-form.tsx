"use client";

import { useMemo, useState } from "react";
import { InlineActionForm } from "@/app/components/forms";
import { ChatSidebarSection } from "@/app/components/chat-sidebar-section";
import {
  FriendInvitePicker,
  type InviteFriendOption,
} from "@/app/components/friend-invite-picker";
import { requestWorkspaceDmAction } from "@/app/actions/social";

type WorkspaceOption = { id: string; name: string };

/** Start a DM: friend or workspace-member picker (hides people with an open DM). */
export function StartDmForm({
  friends,
  peopleWithDmIds,
  workspaces,
  membersByWorkspace,
}: {
  friends: InviteFriendOption[];
  /** Anyone who already has an open (non-closed) DM with the viewer. */
  peopleWithDmIds: string[];
  workspaces: WorkspaceOption[];
  membersByWorkspace: Record<string, InviteFriendOption[]>;
}) {
  const [scope, setScope] = useState("__friends__");
  const friendsMode = scope === "__friends__";

  const workspaceMembers = useMemo(
    () => membersByWorkspace[scope] ?? [],
    [membersByWorkspace, scope],
  );

  return (
    <ChatSidebarSection
      title="Message someone"
      description="Pick Friends or a workspace. People you already have an open DM with stay hidden. Closed DMs don’t block starting a new chat."
    >
      <InlineActionForm
        className="flex flex-col gap-2"
        action={requestWorkspaceDmAction}
        submitLabel="Send"
      >
        <select
          name="workspaceId"
          className="rowgon-input text-sm"
          required
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        >
          <option value="__friends__">Friends</option>
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.name}
            </option>
          ))}
        </select>
        {friendsMode ? (
          <FriendInvitePicker
            friends={friends}
            excludeIds={peopleWithDmIds}
            targetName="username"
            placeholder="Search friends"
            emptyMessage="No friends yet — add friends from the Friends tab."
          />
        ) : (
          <FriendInvitePicker
            key={scope}
            friends={workspaceMembers}
            excludeIds={peopleWithDmIds}
            targetName="username"
            placeholder="Search members"
            searchPlaceholder="Search members"
            emptyMessage="No other members in this workspace yet."
          />
        )}
        <input
          name="message"
          required
          placeholder="First message"
          className="rowgon-input text-sm"
        />
      </InlineActionForm>
    </ChatSidebarSection>
  );
}
