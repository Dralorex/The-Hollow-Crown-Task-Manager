"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/app/actions/auth";
import {
  clearTypingAction,
  sendMessageAction,
  setChatNotifyModeAction,
  setTypingAction,
  touchChatSeenAction,
} from "@/app/actions/social";
import { ChatTypingLine } from "@/app/components/chat-presence";
import { highlightMessageParts, type TaskLinkInfo } from "@/lib/task-links";

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

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rowgon-btn-primary min-h-11 text-sm disabled:opacity-60">
      {pending ? "…" : "Send"}
    </button>
  );
}

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
}: {
  groupId: string;
  options: MentionOption[];
  taskOptions?: TaskOption[];
  memberUsernames?: { userId: string; username: string }[];
  notifyMode: "ALL" | "MENTIONS" | "MUTE";
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [picker, setPicker] = useState<"mention" | "task" | null>(null);
  const [filter, setFilter] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimer = useRef<number | null>(null);
  const lastTypingSent = useRef(0);
  const [state, formAction] = useActionState(
    async (prev: ActionResult | null, formData: FormData) => {
      const result = await sendMessageAction(prev, formData);
      if (result?.ok) {
        setBody("");
        setPicker(null);
        void clearTypingAction(groupId);
        router.refresh();
      }
      return result;
    },
    null,
  );

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

  useEffect(() => {
    const form = new FormData();
    form.set("groupId", groupId);
    void touchChatSeenAction(null, form);
    const id = window.setInterval(() => {
      void touchChatSeenAction(null, form);
    }, 30_000);
    return () => window.clearInterval(id);
  }, [groupId]);

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

    // Typing heartbeat (throttle ~2s)
    if (value.trim()) {
      const now = Date.now();
      if (now - lastTypingSent.current > 2000) {
        lastTypingSent.current = now;
        void setTypingAction(groupId);
      }
      if (typingTimer.current) window.clearTimeout(typingTimer.current);
      typingTimer.current = window.setTimeout(() => {
        void clearTypingAction(groupId);
      }, 3500);
    } else {
      void clearTypingAction(groupId);
    }
  }

  useEffect(() => {
    return () => {
      if (typingTimer.current) window.clearTimeout(typingTimer.current);
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
      <ChatTypingLine groupId={groupId} memberUsernames={memberUsernames} />
      <form action={formAction} className="relative flex flex-col gap-2 sm:flex-row sm:items-end">
        <input type="hidden" name="groupId" value={groupId} />
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
            className="rowgon-input min-h-[3.25rem] w-full"
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
        <SubmitButton />
      </form>
      {state && !state.ok ? (
        <p className="text-sm text-[#9b2f22]">{state.error}</p>
      ) : null}

      <form action={notifyAction} className="flex flex-wrap items-center gap-2 text-xs text-[#0A3D45]/65">
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
