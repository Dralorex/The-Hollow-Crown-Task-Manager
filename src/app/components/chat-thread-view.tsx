"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { fetchChatMessagesSinceAction } from "@/app/actions/social";
import {
  ChatComposer,
  ChatMessageBody,
  type OptimisticThreadMessage,
} from "@/app/components/chat-composer";
import {
  useAblyClient,
  useRealtimeEnabled,
} from "@/app/components/realtime-provider";
import {
  CHAT_MESSAGE_EVENT,
  type ChatMessageEvent,
} from "@/lib/chat-message-events";
import type { TaskLinkInfo } from "@/lib/task-links";

export type ThreadMessage = OptimisticThreadMessage;

type MentionOption =
  | { kind: "user"; label: string; insert: string }
  | { kind: "everyone"; label: string; insert: string }
  | { kind: "role"; label: string; insert: string };

type TaskOption = {
  id: string;
  name: string;
  workspaceName: string;
  insert: string;
};

/** When Ably isn't connected, poll often enough that chat still feels live. */
const SOFT_POLL_MS = 4_000;

export function ChatThreadView({
  groupId,
  currentUserId,
  initialMessages,
  taskMap,
  mentionOptions,
  taskOptions,
  memberUsernames,
  notifyMode,
}: {
  groupId: string;
  currentUserId: string;
  initialMessages: ThreadMessage[];
  taskMap: Record<string, TaskLinkInfo>;
  mentionOptions: MentionOption[];
  taskOptions: TaskOption[];
  memberUsernames: { userId: string; username: string }[];
  notifyMode: "ALL" | "MENTIONS" | "MUTE";
}) {
  const [messages, setMessages] = useState<ThreadMessage[]>(initialMessages);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef(messages);
  const ablyClient = useAblyClient();
  const realtimeEnabled = useRealtimeEnabled();
  const liveAbly = realtimeEnabled && Boolean(ablyClient);
  const serverIds = useMemo(
    () => new Set(initialMessages.map((m) => m.id)),
    [initialMessages],
  );

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Sync when RSC provides a newer server snapshot (other user's messages, etc.).
  useEffect(() => {
    setMessages((prev) => {
      const pending = prev.filter(
        (m) => (m.pending || m.failed) && !serverIds.has(m.id),
      );
      const merged = [...initialMessages];
      for (const p of pending) {
        if (!merged.some((m) => m.id === p.id)) merged.push(p);
      }
      return merged;
    });
  }, [initialMessages, serverIds]);

  useEffect(() => {
    function onMessage(event: Event) {
      const detail = (event as CustomEvent<ChatMessageEvent>).detail;
      if (!detail || detail.groupId !== groupId) return;
      if (detail.senderId === currentUserId) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === detail.id)) return prev;
        return [
          ...prev,
          {
            id: detail.id,
            body: detail.body,
            createdAt: detail.createdAt,
            senderLabel: detail.senderLabel,
            senderId: detail.senderId,
          },
        ];
      });
    }
    window.addEventListener(CHAT_MESSAGE_EVENT, onMessage);
    return () => window.removeEventListener(CHAT_MESSAGE_EVENT, onMessage);
  }, [groupId, currentUserId]);

  // Soft-poll fallback when Ably env is off OR the socket isn't connected yet.
  useEffect(() => {
    if (liveAbly) return;
    let cancelled = false;

    const pull = async () => {
      const list = messagesRef.current;
      const latest = [...list].reverse().find((m) => !m.pending && !m.failed);
      const result = await fetchChatMessagesSinceAction(
        groupId,
        latest?.createdAt ?? null,
      );
      if (cancelled || !result.ok) return;
      setMessages((prev) => {
        let next = prev;
        for (const msg of result.messages) {
          if (msg.senderId === currentUserId) continue;
          if (next.some((m) => m.id === msg.id)) continue;
          if (next === prev) next = [...prev];
          next.push({
            id: msg.id,
            body: msg.body,
            createdAt: msg.createdAt,
            senderLabel: msg.senderLabel,
            senderId: msg.senderId,
          });
        }
        return next;
      });
    };

    void pull();
    const id = window.setInterval(() => {
      void pull();
    }, SOFT_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [groupId, currentUserId, liveAbly]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <>
      <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`text-sm ${msg.pending ? "opacity-70" : ""} ${
              msg.failed ? "opacity-80" : ""
            }`}
          >
            <span className="font-semibold text-[#0A3D45]">
              {msg.senderLabel}
            </span>{" "}
            <span className="text-xs text-[#0A3D45]/45">
              {format(new Date(msg.createdAt), "MMM d · HH:mm")}
              {msg.pending ? " · sending" : null}
              {msg.failed ? " · failed" : null}
            </span>
            <ChatMessageBody body={msg.body} taskMap={taskMap} />
          </div>
        ))}
        {messages.length === 0 ? (
          <p className="text-sm text-[#0A3D45]/55">No messages yet.</p>
        ) : null}
        <div ref={bottomRef} />
      </div>
      <div className="mt-3 shrink-0 border-t border-[#0A3D45]/10 bg-[var(--tide-panel-bg,inherit)] pt-3">
        <ChatComposer
          groupId={groupId}
          options={mentionOptions}
          taskOptions={taskOptions}
          memberUsernames={memberUsernames}
          notifyMode={notifyMode}
          currentUserId={currentUserId}
          onOptimisticAppend={(msg) => {
            setMessages((prev) => [...prev, msg]);
          }}
          onOptimisticConfirm={(tempId, real) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempId
                  ? {
                      id: real.id,
                      body: real.body,
                      createdAt: real.createdAt,
                      senderLabel: real.senderLabel,
                      senderId: real.senderId,
                    }
                  : m,
              ),
            );
          }}
          onOptimisticFail={(tempId) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempId ? { ...m, pending: false, failed: true } : m,
              ),
            );
          }}
        />
      </div>
    </>
  );
}
