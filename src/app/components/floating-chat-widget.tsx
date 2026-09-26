"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { format } from "date-fns";
import {
  loadFloatingChatListAction,
  loadFloatingChatThreadAction,
  type FloatingChatSummary,
  type FloatingChatThread,
} from "@/app/actions/floating-chat";
import { sendMessageAction } from "@/app/actions/social";
import { MarkChatSeen } from "@/app/components/mark-chat-seen";

const STORAGE_KEY = "rowgon.chat.widget";

type ChatTab = "dms" | "groups" | "workspace-groups";
type View = "hub" | "list" | "thread";

type WidgetPrefs = {
  open: boolean;
  lastGroupId: string | null;
  lastTab: ChatTab | null;
};

function readPrefs(): WidgetPrefs {
  if (typeof window === "undefined") {
    return { open: false, lastGroupId: null, lastTab: null };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { open: false, lastGroupId: null, lastTab: null };
    const parsed = JSON.parse(raw) as Partial<WidgetPrefs>;
    const lastTab =
      parsed.lastTab === "dms" ||
      parsed.lastTab === "groups" ||
      parsed.lastTab === "workspace-groups"
        ? parsed.lastTab
        : null;
    return {
      open: Boolean(parsed.open),
      lastGroupId:
        typeof parsed.lastGroupId === "string" ? parsed.lastGroupId : null,
      lastTab,
    };
  } catch {
    return { open: false, lastGroupId: null, lastTab: null };
  }
}

function writePrefs(prefs: WidgetPrefs) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore quota / private mode */
  }
}

function kindForTab(tab: ChatTab): FloatingChatSummary["kind"] {
  if (tab === "dms") return "dm";
  if (tab === "workspace-groups") return "workspace";
  return "group";
}

function tabForKind(kind: FloatingChatSummary["kind"]): ChatTab {
  if (kind === "dm") return "dms";
  if (kind === "workspace") return "workspace-groups";
  return "groups";
}

function tabTitle(tab: ChatTab) {
  if (tab === "dms") return "DMs";
  if (tab === "workspace-groups") return "Workspace groups";
  return "Groups";
}

export function FloatingChatWidget({
  chatUnreadCount = 0,
}: {
  chatUnreadCount?: number;
}) {
  const pathname = usePathname();
  const hideOnChatPage = pathname.startsWith("/app/chat");

  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [lastGroupId, setLastGroupId] = useState<string | null>(null);
  const [lastTab, setLastTab] = useState<ChatTab | null>(null);
  const [view, setView] = useState<View>("hub");
  const [listTab, setListTab] = useState<ChatTab>("dms");
  const [chats, setChats] = useState<FloatingChatSummary[]>([]);
  const [thread, setThread] = useState<FloatingChatThread | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLInputElement | null>(null);
  const prefsRef = useRef<WidgetPrefs>({
    open: false,
    lastGroupId: null,
    lastTab: null,
  });

  useEffect(() => {
    const prefs = readPrefs();
    prefsRef.current = prefs;
    setOpen(prefs.open);
    setLastGroupId(prefs.lastGroupId);
    setLastTab(prefs.lastTab);
    if (prefs.open && prefs.lastGroupId) {
      setView("thread");
      if (prefs.lastTab) setListTab(prefs.lastTab);
    } else if (prefs.open) {
      setView("hub");
    }
    setReady(true);
  }, []);

  const persist = useCallback((next: Partial<WidgetPrefs>) => {
    const merged: WidgetPrefs = {
      open: next.open ?? prefsRef.current.open,
      lastGroupId:
        next.lastGroupId !== undefined
          ? next.lastGroupId
          : prefsRef.current.lastGroupId,
      lastTab:
        next.lastTab !== undefined ? next.lastTab : prefsRef.current.lastTab,
    };
    prefsRef.current = merged;
    writePrefs(merged);
    if (next.open !== undefined) setOpen(merged.open);
    if (next.lastGroupId !== undefined) setLastGroupId(merged.lastGroupId);
    if (next.lastTab !== undefined) setLastTab(merged.lastTab);
  }, []);

  const refreshList = useCallback(async () => {
    const result = await loadFloatingChatListAction();
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setChats(result.chats);
  }, []);

  const openThread = useCallback(
    async (groupId: string, tabHint?: ChatTab) => {
      setError(null);
      const result = await loadFloatingChatThreadAction(groupId);
      if (!result.ok) {
        setError(result.error);
        setView(tabHint || lastTab ? "list" : "hub");
        setThread(null);
        return;
      }
      const chatMeta = chats.find((c) => c.id === groupId);
      const nextTab =
        tabHint ??
        (chatMeta ? tabForKind(chatMeta.kind) : lastTab) ??
        "dms";
      setListTab(nextTab);
      setThread(result.thread);
      setView("thread");
      persist({ lastGroupId: groupId, lastTab: nextTab });
      setDraft("");
    },
    [chats, lastTab, persist],
  );

  // Load list / last thread when panel opens.
  useEffect(() => {
    if (!ready || !open || hideOnChatPage) return;

    startTransition(() => {
      void (async () => {
        await refreshList();
        if (view === "thread" && lastGroupId) {
          await openThread(lastGroupId, lastTab ?? undefined);
        }
      })();
    });
    // Only when open/ready flips — intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, open, hideOnChatPage]);

  // Soft-poll thread + list while open.
  useEffect(() => {
    if (!ready || !open || hideOnChatPage) return;
    const id = window.setInterval(() => {
      void refreshList();
      if (view === "thread" && (thread?.id || lastGroupId)) {
        void loadFloatingChatThreadAction(thread?.id ?? lastGroupId!).then(
          (result) => {
            if (result.ok) setThread(result.thread);
          },
        );
      }
    }, 4000);
    return () => window.clearInterval(id);
  }, [
    ready,
    open,
    hideOnChatPage,
    view,
    thread?.id,
    lastGroupId,
    refreshList,
  ]);

  useEffect(() => {
    if (view !== "thread") return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [view, thread?.messages.length]);

  useEffect(() => {
    if (view !== "thread" || !thread || thread.closed) return;
    const id = window.setTimeout(() => composerRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [view, thread?.id, thread?.closed]);

  if (!ready || hideOnChatPage) return null;

  const filtered = chats.filter((c) => c.kind === kindForTab(listTab));
  const counts = {
    groups: chats.filter((c) => c.kind === "group").length,
    workspace: chats.filter((c) => c.kind === "workspace").length,
    dms: chats.filter((c) => c.kind === "dm").length,
  };
  const unread = {
    groups: chats
      .filter((c) => c.kind === "group")
      .reduce((n, c) => n + c.unread, 0),
    workspace: chats
      .filter((c) => c.kind === "workspace")
      .reduce((n, c) => n + c.unread, 0),
    dms: chats
      .filter((c) => c.kind === "dm")
      .reduce((n, c) => n + c.unread, 0),
  };

  const toggleOpen = () => {
    const next = !open;
    persist({ open: next });
    if (next && lastGroupId) {
      setView("thread");
    } else if (next) {
      setView("hub");
    }
  };

  const closePanel = () => {
    persist({ open: false });
  };

  const openList = (tab: ChatTab) => {
    setListTab(tab);
    setView("list");
    setThread(null);
    persist({ lastTab: tab });
    void refreshList();
  };

  const backFromThread = () => {
    setView("list");
    setThread(null);
    void refreshList();
  };

  const backFromList = () => {
    setView("hub");
    setThread(null);
  };

  const onSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!thread || thread.closed || !draft.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("groupId", thread.id);
      fd.set("body", draft.trim());
      const result = await sendMessageAction(null, fd);
      if (!result?.ok) {
        setError(result && "error" in result ? result.error : "Send failed.");
        return;
      }
      setDraft("");
      await openThread(thread.id, listTab);
      await refreshList();
      composerRef.current?.focus();
    } finally {
      setSending(false);
    }
  };

  const badge =
    chatUnreadCount > 0
      ? chatUnreadCount > 99
        ? "99+"
        : String(chatUnreadCount)
      : null;

  const headerTitle =
    view === "thread" && thread
      ? thread.title
      : view === "list"
        ? tabTitle(listTab)
        : "Messages";

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open ? (
        <div
          className="pointer-events-auto h-[min(34rem,calc(100vh-6.5rem))] w-[min(22.5rem,calc(100vw-1.5rem))] animate-[rowgon-rise_220ms_ease]"
          role="dialog"
          aria-label="Chat"
        >
        <div className="rowgon-menu-popover flex h-full w-full flex-col overflow-hidden rounded-2xl">
          <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[color:var(--rowgon-deep)]/10 px-3 py-2.5">
            <div className="min-w-0">
              {view === "thread" ? (
                <button
                  type="button"
                  onClick={backFromThread}
                  className="text-left text-xs text-[color:var(--rowgon-deep)]/60 hover:underline"
                >
                  ← {tabTitle(listTab)}
                </button>
              ) : view === "list" ? (
                <button
                  type="button"
                  onClick={backFromList}
                  className="text-left text-xs text-[color:var(--rowgon-deep)]/60 hover:underline"
                >
                  ← Chat
                </button>
              ) : (
                <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--rowgon-deep)]/50">
                  Chat
                </p>
              )}
              <h2 className="truncate font-[family-name:var(--font-display)] text-lg text-[color:var(--rowgon-deep)]">
                {headerTitle}
              </h2>
            </div>
            <button
              type="button"
              onClick={closePanel}
              className="rounded-full px-2.5 py-1 text-lg leading-none text-[color:var(--rowgon-deep)]/55 hover:bg-[color:var(--rowgon-deep)]/8 hover:text-[color:var(--rowgon-deep)]"
              aria-label="Close chat"
            >
              ×
            </button>
          </header>

          {error ? (
            <p className="shrink-0 px-3 py-2 text-sm text-[color:var(--rowgon-coral)]">{error}</p>
          ) : null}

          {view === "hub" ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <p className="mb-3 text-xs text-[color:var(--rowgon-deep)]/60">
                Choose Groups, Workspace groups, or DMs.
              </p>
              <div className="flex flex-col gap-2">
                {(
                  [
                    {
                      tab: "groups" as const,
                      label: "Groups",
                      count: counts.groups,
                      unread: unread.groups,
                      blurb: "Conversations with friends",
                    },
                    {
                      tab: "workspace-groups" as const,
                      label: "Workspace groups",
                      count: counts.workspace,
                      unread: unread.workspace,
                      blurb: "Workspace chats",
                    },
                    {
                      tab: "dms" as const,
                      label: "DMs",
                      count: counts.dms,
                      unread: unread.dms,
                      blurb: "Direct messages",
                    },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.tab}
                    type="button"
                    onClick={() => openList(item.tab)}
                    className="group flex w-full items-center justify-between rounded-lg border border-[color:var(--rowgon-deep)]/12 bg-[color:var(--rowgon-deep)]/[0.03] px-3 py-3.5 text-left transition hover:border-[color:var(--rowgon-deep)]/25 hover:bg-[color:var(--rowgon-deep)]/[0.06]"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-base text-[color:var(--rowgon-deep)]">
                        {item.label}
                        {item.unread > 0 ? (
                          <span className="rounded-full bg-[color:var(--rowgon-coral)] px-1.5 text-[10px] font-semibold leading-4 text-white">
                            {item.unread > 99 ? "99+" : item.unread}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs text-[color:var(--rowgon-deep)]/55">
                        {item.count} conversation{item.count === 1 ? "" : "s"}
                        {" · "}
                        {item.blurb}
                      </p>
                    </div>
                    <span className="text-[color:var(--rowgon-deep)]/40 transition group-hover:text-[color:var(--rowgon-deep)]">
                      →
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {view === "list" ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {pending && filtered.length === 0 ? (
                <p className="px-3 py-4 text-sm text-[color:var(--rowgon-deep)]/55">Loading…</p>
              ) : null}
              <ul className="divide-y divide-[color:var(--rowgon-deep)]/8">
                {filtered.map((chat) => (
                  <li key={chat.id}>
                    <button
                      type="button"
                      onClick={() => {
                        startTransition(() => {
                          void openThread(chat.id, listTab);
                        });
                      }}
                      className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-[color:var(--rowgon-deep)]/[0.04]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-[color:var(--rowgon-deep)]">
                            {chat.title}
                          </span>
                          {chat.closed ? (
                            <span className="shrink-0 text-[10px] uppercase tracking-wide text-[color:var(--rowgon-deep)]/40">
                              Closed
                            </span>
                          ) : null}
                          {chat.unread > 0 ? (
                            <span className="rounded-full bg-[color:var(--rowgon-coral)] px-1.5 text-[10px] font-semibold leading-4 text-white">
                              {chat.unread > 99 ? "99+" : chat.unread}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-[color:var(--rowgon-deep)]/55">
                          {chat.snippet}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              {!pending && filtered.length === 0 ? (
                <p className="px-3 py-4 text-sm text-[color:var(--rowgon-deep)]/55">
                  No conversations here yet. Open the Chat tab to start one.
                </p>
              ) : null}
            </div>
          ) : null}

          {view === "thread" && thread ? (
            <>
              <MarkChatSeen groupId={thread.id} />
              <p className="shrink-0 truncate px-3 pt-2 text-[11px] text-[color:var(--rowgon-deep)]/45">
                {thread.membersLabel}
                {thread.closed ? " · closed" : ""}
              </p>
              <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-2">
                {thread.messages.map((msg) => (
                  <div key={msg.id} className="text-sm">
                    <span className="font-semibold text-[color:var(--rowgon-deep)]">
                      {msg.mine ? "You" : msg.senderLabel}
                    </span>{" "}
                    <span className="text-[11px] text-[color:var(--rowgon-deep)]/45">
                      {format(new Date(msg.createdAt), "MMM d · HH:mm")}
                    </span>
                    <p className="whitespace-pre-wrap text-[color:var(--rowgon-deep)]/80">
                      {msg.body}
                    </p>
                  </div>
                ))}
                {thread.messages.length === 0 ? (
                  <p className="text-sm text-[color:var(--rowgon-deep)]/55">No messages yet.</p>
                ) : null}
                <div ref={messagesEndRef} />
              </div>
              <div className="shrink-0 border-t border-[color:var(--rowgon-deep)]/10 px-3 py-2.5">
                {thread.closed ? (
                  <p className="rounded-md bg-[color:var(--rowgon-deep)]/[0.05] px-2.5 py-2 text-xs text-[color:var(--rowgon-deep)]/70">
                    This chat was closed. You can still read it here.
                  </p>
                ) : (
                  <form className="flex gap-2" onSubmit={onSend}>
                    <input
                      ref={composerRef}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Write a message…"
                      className="rowgon-input flex-1 !py-2 text-sm"
                      disabled={sending}
                      autoComplete="off"
                    />
                    <button
                      type="submit"
                      disabled={sending || !draft.trim()}
                      className="rowgon-btn-secondary !px-3 !py-2 text-sm disabled:opacity-60"
                    >
                      {sending ? "…" : "Send"}
                    </button>
                  </form>
                )}
              </div>
            </>
          ) : null}

          {view === "thread" && !thread && pending ? (
            <p className="px-3 py-4 text-sm text-[color:var(--rowgon-deep)]/55">Loading chat…</p>
          ) : null}
        </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={toggleOpen}
        className="pointer-events-auto relative flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--rowgon-deep)] text-[color:var(--rowgon-foam)] shadow-[0_12px_32px_color-mix(in_srgb,var(--rowgon-deep)_28%,transparent)] transition hover:scale-[1.04] hover:bg-[color:var(--rowgon-mid)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--rowgon-sea)]"
        aria-label={open ? "Close chat" : "Open chat"}
        aria-expanded={open}
      >
        {open ? (
          <span className="text-2xl leading-none" aria-hidden>
            ×
          </span>
        ) : (
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <path
              d="M4.5 6.75A2.25 2.25 0 0 1 6.75 4.5h10.5a2.25 2.25 0 0 1 2.25 2.25v7.5a2.25 2.25 0 0 1-2.25 2.25H10.5L6 19.5v-2.25H6.75A2.25 2.25 0 0 1 4.5 15V6.75Z"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinejoin="round"
            />
            <path
              d="M8.25 9.75h7.5M8.25 12.75h5"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        )}
        {!open && badge ? (
          <span className="absolute -right-0.5 -top-0.5 min-w-[1.25rem] rounded-full bg-[color:var(--rowgon-coral)] px-1 text-center text-[11px] font-semibold leading-5 text-white">
            {badge}
          </span>
        ) : null}
      </button>
    </div>
  );
}
