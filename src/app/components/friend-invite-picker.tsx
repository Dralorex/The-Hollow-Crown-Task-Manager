"use client";

import { useMemo, useState } from "react";
import { EmailShortcutChips } from "@/app/components/email-field";

export type InviteFriendOption = {
  id: string;
  username: string;
  label: string;
};

/**
 * Friend typeahead for workspace invites, starting DMs, and friend groups.
 * - single: fills one username field
 * - multi: checkbox list; submits comma-separated usernames via `membersName`
 */
export function FriendInvitePicker({
  friends,
  targetName = "target",
  membersName = "members",
  mode = "single",
  excludeIds = [],
  required = true,
  placeholder = "Friend username or email",
  searchPlaceholder = "Search friends",
  selectedItemNoun = "friend",
  emptyMessage = "No friends yet — type a username or email above.",
}: {
  friends: InviteFriendOption[];
  targetName?: string;
  membersName?: string;
  mode?: "single" | "multi";
  excludeIds?: string[];
  required?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  selectedItemNoun?: string;
  emptyMessage?: string;
}) {
  const available = useMemo(() => {
    if (excludeIds.length === 0) return friends;
    const blocked = new Set(excludeIds);
    return friends.filter((friend) => !blocked.has(friend.id));
  }, [friends, excludeIds]);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [emailFocused, setEmailFocused] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return available;
    return available.filter(
      (friend) =>
        friend.username.toLowerCase().includes(q) ||
        friend.label.toLowerCase().includes(q),
    );
  }, [available, query]);

  if (mode === "multi") {
    const selectedUsernames = available
      .filter((friend) => selected.has(friend.id))
      .map((friend) => friend.username);

    function toggle(id: string) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }

    return (
      <div className="space-y-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          autoComplete="off"
          className="rowgon-input text-sm"
        />
        <input
          type="hidden"
          name={membersName}
          value={selectedUsernames.join(",")}
          required={required && selectedUsernames.length === 0}
        />
        {available.length > 0 ? (
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-[color:var(--panel-border)] bg-[color:var(--menu-bg)] p-2">
            {filtered.length > 0 ? (
              filtered.map((friend) => {
                const checked = selected.has(friend.id);
                return (
                  <li key={friend.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[color:var(--rowgon-deep)] transition hover:bg-[color:var(--rowgon-deep)]/8">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[color:var(--rowgon-deep)]"
                        checked={checked}
                        onChange={() => toggle(friend.id)}
                      />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {friend.label}
                      </span>
                      <span className="shrink-0 text-xs text-[color:var(--rowgon-deep)]/55">
                        @{friend.username}
                      </span>
                    </label>
                  </li>
                );
              })
            ) : (
              <li className="px-2 py-1.5 text-xs text-[color:var(--rowgon-deep)]/55">
                No friends match “{query.trim()}”.
              </li>
            )}
          </ul>
        ) : (
          <p className="text-xs text-[#0A3D45]/55">
            {friends.length === 0
              ? emptyMessage
              : "No friends available to add."}
          </p>
        )}
        {selectedUsernames.length > 0 ? (
          <p className="text-xs text-[#0A3D45]/55">
            {selectedUsernames.length} {selectedItemNoun}
            {selectedUsernames.length === 1 ? "" : "s"} selected
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        name={targetName}
        required={required}
        value={query}
        onChange={(e) => setQuery(e.target.value.toLowerCase())}
        onInput={(e) => {
          const el = e.currentTarget;
          const lower = el.value.toLowerCase();
          if (el.value !== lower) {
            el.value = lower;
            setQuery(lower);
          }
        }}
        onFocus={() => setEmailFocused(true)}
        onBlur={() => setEmailFocused(false)}
        placeholder={placeholder}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        inputMode="email"
        className="rowgon-input text-sm"
      />
      <EmailShortcutChips
        value={query}
        onChange={(next) => setQuery(next.toLowerCase())}
        visible={emailFocused}
      />
      {available.length > 0 ? (
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-[color:var(--panel-border)] bg-[color:var(--menu-bg)] p-2">
          {filtered.length > 0 ? (
            filtered.map((friend) => (
              <li key={friend.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm text-[color:var(--rowgon-deep)] transition hover:bg-[color:var(--rowgon-deep)]/8"
                  onClick={() => setQuery(friend.username)}
                >
                  <span className="truncate font-medium">{friend.label}</span>
                  <span className="ml-2 shrink-0 text-xs text-[color:var(--rowgon-deep)]/55">
                    @{friend.username}
                  </span>
                </button>
              </li>
            ))
          ) : (
            <li className="px-2 py-1.5 text-xs text-[#0A3D45]/55">
              No friends match “{query.trim()}”.
            </li>
          )}
        </ul>
      ) : (
        <p className="text-xs text-[#0A3D45]/55">
          {friends.length === 0
            ? emptyMessage
            : "All your friends already have a DM with you."}
        </p>
      )}
    </div>
  );
}
