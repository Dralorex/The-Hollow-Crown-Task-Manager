"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { sendMessageAction } from "@/app/actions/social";

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rowgon-btn-secondary text-sm disabled:opacity-60"
    >
      {pending ? "…" : "Send"}
    </button>
  );
}

/** Thread composer that focuses the message field as soon as the chat opens. */
export function ChatMessageComposer({ groupId }: { groupId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, action] = useActionState(sendMessageAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [groupId]);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      inputRef.current?.focus();
    }
  }, [state]);

  return (
    <div className="space-y-2">
      <form ref={formRef} className="flex gap-2" action={action}>
        <input type="hidden" name="groupId" value={groupId} />
        <input
          ref={inputRef}
          name="body"
          required
          placeholder="Write a message…"
          className="rowgon-input flex-1"
          autoComplete="off"
        />
        <SendButton />
      </form>
      {state && !state.ok ? (
        <p className="text-sm text-[#9b2f22]">{state.error}</p>
      ) : null}
    </div>
  );
}
