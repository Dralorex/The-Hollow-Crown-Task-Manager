"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import type { ActionResult } from "@/app/actions/auth";
import {
  clearTypingAction,
  sendMessageAction,
  setChatNotifyModeAction,
  setTypingAction,
} from "@/app/actions/social";
import {
  ChatTypingLine,
  setLocalChatTyping,
} from "@/app/components/chat-presence";
import { highlightMessageParts, type TaskLinkInfo } from "@/lib/task-links";

export type OptimisticThreadMessage = {
  id: string;
  body: string;
  createdAt: string;
  senderLabel: string;
  senderId: string;
  pending?: boolean;
  failed?: boolean;
};

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

export function ChatMessageBody({
  body,
  taskMap,
}: {
  body: string;
  taskMap?: Record<string, TaskLinkInfo>;
}) {
  const parts = highlightMessageParts(body, taskMap);
  return (
    <p className="text-[#0A3D45]/80">
      {parts.map((part, i) => {
        if (part.type === "mention") {
          return (
            <span key={i} className="font-semibold text-[#1a7a82]">
              {part.text}
            </span>
          );
        }
        if (part.type === "task") {
          if (part.href) {
            return (
              <Link
                key={i}
                href={part.href}
                className="inline-flex items-center rounded-md bg-[#E85D4C]/12 px-1.5 py-0.5 font-semibold text-[#9b2f22] underline-offset-2 hover:underline"
                title={part.name ?? part.taskId}
              >
                {part.text}
              </Link>
            );
          }
          return (
            <span key={i} className="font-semibold text-[#9b2f22]/80">
              {part.text}
            </span>
          );
        }
        return <span key={i}>{part.text}</span>;
      })}
    </p>
  );
}

export function ChatComposer({
  groupId,
  options,
  taskOptions = [],
  memberUsernames = [],
  notifyMode,
  currentUserId,
  showTypingLine = true,
  onOptimisticAppend,
  onOptimisticConfirm,
  onOptimisticFail,
}: {
  groupId: string;
  options: MentionOption[];
  taskOptions?: TaskOption[];
  memberUsernames?: { userId: string; username: string }[];
  notifyMode: "ALL" | "MENTIONS" | "MUTE";
  currentUserId?: string;
  /** When false, typing lives in the members panel instead. */
  showTypingLine?: boolean;
  onOptimisticAppend?: (msg: OptimisticThreadMessage) => void;
  onOptimisticConfirm?: (
    tempId: string,
    real: {
      id: string;
      body: string;
      createdAt: string;
      senderLabel: string;
      senderId: string;
    },
  ) => void;
  onOptimisticFail?: (tempId: string) => void;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [picker, setPicker] = useState<"mention" | "task" | null>(null);
  const [filter, setFilter] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimer = useRef<number | null>(null);
  const lastTypingSent = useRef(0);

  const filteredMentions = useMemo(() => {
    const q = filter.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, filter]);

  const filteredTasks = useMemo(() => {
    const q = filter.toLowerCase();
    return taskOptions.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.workspaceName.toLowerCase().includes(q),
    );
  }, [taskOptions, filter]);

  // Seen / presence heartbeats live in MarkChatSeen (one writer per open thread).

  function onChange(value: string) {
    setBody(value);
    const cursor = inputRef.current?.selectionStart ?? value.length;
    const before = value.slice(0, cursor);

    const hash = before.lastIndexOf("#");
    const at = before.lastIndexOf("@");
    const triggerAt = Math.max(hash, at);
    if (triggerAt < 0) {
      setPicker(null);
      setFilter("");
    } else {
      const token = before.slice(triggerAt + 1);
      if (/\s/.test(token)) {
        setPicker(null);
        setFilter("");
      } else if (hash > at) {
        if (token.toLowerCase().startsWith("task:")) {
          setPicker(null);
          setFilter("");
        } else {
          setFilter(token);
          setPicker(taskOptions.length ? "task" : null);
        }
      } else {
        setFilter(token);
        setPicker("mention");
      }
    }

    if (value.trim()) {
      const now = Date.now();
      if (now - lastTypingSent.current > 2000) {
        lastTypingSent.current = now;
        setLocalChatTyping(groupId, true);
        void setTypingAction(groupId);
      }
      if (typingTimer.current) window.clearTimeout(typingTimer.current);
      typingTimer.current = window.setTimeout(() => {
        setLocalChatTyping(groupId, false);
        void clearTypingAction(groupId);
      }, 3500);
    } else {
      setLocalChatTyping(groupId, false);
      void clearTypingAction(groupId);
    }
  }

  useEffect(() => {
    return () => {
      if (typingTimer.current) window.clearTimeout(typingTimer.current);
      setLocalChatTyping(groupId, false);
      void clearTypingAction(groupId);
    };
  }, [groupId]);

  function insertToken(insert: string, trigger: "#" | "@") {
    const el = inputRef.current;
    const cursor = el?.selectionStart ?? body.length;
    const before = body.slice(0, cursor);
    const after = body.slice(cursor);
    const at = before.lastIndexOf(trigger);
    if (at < 0) return;
    const next = `${before.slice(0, at)}${insert} ${after}`;
    setBody(next);
    setPicker(null);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = at + insert.length + 1;
      el?.setSelectionRange(pos, pos);
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || sending) return;

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const draftSnapshot = trimmed;
    setSendError(null);
    setBody("");
    setPicker(null);
    setLocalChatTyping(groupId, false);
    void clearTypingAction(groupId);

    onOptimisticAppend?.({
      id: tempId,
      body: draftSnapshot,
      createdAt: new Date().toISOString(),
      senderLabel: "You",
      senderId: currentUserId ?? "self",
      pending: true,
    });

    // Keep focus; do not block the button on a full reload.
    requestAnimationFrame(() => inputRef.current?.focus());

    setSending(true);
    try {
      const fd = new FormData();
      fd.set("groupId", groupId);
      fd.set("body", draftSnapshot);
      const result = await sendMessageAction(null, fd);
      if (!result?.ok) {
        setSendError(
          result && "error" in result ? result.error : "Send failed.",
        );
        setBody(draftSnapshot);
        onOptimisticFail?.(tempId);
        return;
      }
      onOptimisticConfirm?.(tempId, result.message);
    } catch {
      setSendError("Send failed.");
      setBody(draftSnapshot);
      onOptimisticFail?.(tempId);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  const [notifyState, notifyAction] = useActionState(
    async (prev: ActionResult | null, formData: FormData) => {
      const result = await setChatNotifyModeAction(prev, formData);
      if (result?.ok) router.refresh();
      return result;
    },
    null,
  );

  return (
    <div className="mt-4 space-y-2">
      {showTypingLine ? (
        <ChatTypingLine groupId={groupId} memberUsernames={memberUsernames} />
      ) : null}
      <form
        onSubmit={onSubmit}
        className="relative flex flex-col gap-2 sm:flex-row sm:items-end"
      >
        <div className="relative min-w-0 flex-1">
          <textarea
            ref={inputRef}
            name="body"
            required
            rows={2}
            value={body}
            onChange={(e) => onChange(e.target.value)}
            placeholder={
              taskOptions.length
                ? "Write a message… @ mention · # link a task"
                : "Write a message… use @ to mention"
            }
            className="tide-input min-h-[3.25rem] w-full"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void onSubmit(e);
              }
            }}
          />
          {picker === "mention" && filteredMentions.length > 0 ? (
            <ul className="absolute bottom-full left-0 z-10 mb-1 max-h-40 w-full overflow-y-auto rounded-xl border border-[#0A3D45]/15 bg-white p-1 shadow-lg">
              {filteredMentions.map((opt) => (
                <li key={`${opt.kind}:${opt.insert}`}>
                  <button
                    type="button"
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-[#0A3D45] hover:bg-[#0A3D45]/8"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertToken(opt.insert, "@");
                    }}
                  >
                    {opt.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {picker === "task" && filteredTasks.length > 0 ? (
            <ul className="absolute bottom-full left-0 z-10 mb-1 max-h-48 w-full overflow-y-auto rounded-xl border border-[#0A3D45]/15 bg-white p-1 shadow-lg">
              {filteredTasks.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-[#0A3D45] hover:bg-[#0A3D45]/8"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertToken(t.insert, "#");
                    }}
                  >
                    <span className="font-semibold">{t.name}</span>
                    <span className="mt-0.5 block text-xs text-[#0A3D45]/55">
                      {t.workspaceName}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={!body.trim()}
          className="tide-btn-primary min-h-11 text-sm disabled:opacity-60"
        >
          Send
        </button>
      </form>
      {sendError ? (
        <p className="text-sm text-[#9b2f22]">{sendError}</p>
      ) : null}

      <form
        action={notifyAction}
        className="flex flex-wrap items-center gap-2 text-xs text-[#0A3D45]/65"
      >
        <input type="hidden" name="groupId" value={groupId} />
        <span className="font-semibold">Alerts:</span>
        {(
          [
            ["ALL", "All messages"],
            ["MENTIONS", "Mentions only"],
            ["MUTE", "Mute"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="submit"
            name="mode"
            value={mode}
            className={`rounded-full px-2.5 py-1 font-semibold ${
              notifyMode === mode
                ? "bg-[#0A3D45] text-[#E8F7F6]"
                : "bg-white/60 hover:bg-white"
            }`}
          >
            {label}
          </button>
        ))}
      </form>
      {notifyState && !notifyState.ok ? (
        <p className="text-sm text-[#9b2f22]">{notifyState.error}</p>
      ) : null}
    </div>
  );
}
