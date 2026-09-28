"use client";

import { InlineActionForm } from "@/app/components/forms";
import { ChatSidebarSection } from "@/app/components/chat-sidebar-section";
import {
  FriendInvitePicker,
  type InviteFriendOption,
} from "@/app/components/friend-invite-picker";
import { createFriendGroupChatAction } from "@/app/actions/social";

/** Create a multi-friend group chat (not workspace-scoped). */
export function CreateFriendGroupForm({
  friends,
}: {
  friends: InviteFriendOption[];
}) {
  return (
    <ChatSidebarSection
      title="New group"
      description="Chat with one or more friends outside a workspace."
    >
      <InlineActionForm
        className="flex flex-col gap-2"
        action={createFriendGroupChatAction}
        submitLabel="Create group"
      >
        <input
          name="name"
          required
          placeholder="Group name"
          className="rowgon-input text-sm"
        />
        <FriendInvitePicker
          friends={friends}
          mode="multi"
          membersName="members"
          required
          emptyMessage="Add friends first, then you can start a group."
        />
      </InlineActionForm>
    </ChatSidebarSection>
  );
}
