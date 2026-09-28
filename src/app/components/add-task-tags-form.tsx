"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TagSuggestInput } from "@/app/components/tag-suggest-input";
import {
  addPrivateTagAction,
  addPublicTagAction,
} from "@/app/actions/tasks";
import { enterAdvancesFocus } from "@/lib/form-keyboard";

/** Add one or more tags; only the add button submits (Enter advances focus). */
export function AddTaskTagsForm({
  workspaceId,
  taskId,
  tags,
  variant,
}: {
  workspaceId: string;
  taskId: string;
  tags: string[];
  variant: "public" | "private";
}) {
  const [error, setError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const isPublic = variant === "public";
  const submitLabel = isPublic ? "Add Public Tag" : "Add Private Tag";

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      const result = isPublic
        ? await addPublicTagAction(null, fd)
        : await addPrivateTagAction(null, fd);
      if (result && !result.ok) {
        setError(result.error);
        return;
      }
      setInputKey((k) => k + 1);
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      onKeyDown={enterAdvancesFocus}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="taskId" value={taskId} />
      <TagSuggestInput
        key={inputKey}
        name="name"
        required
        tags={tags}
        placeholder="add tags: example, test, help"
        hint="Separate multiple tags with commas. Use the button to add."
        emptyMessage={
          isPublic
            ? "No public tags in this folder yet — type a new one"
            : "No private tags yet — type a new one"
        }
        allowMultiple
        keepOpenOnPick
      />
      {error ? <p className="text-sm text-[#9b2f22]">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rowgon-btn-secondary text-sm disabled:opacity-60"
      >
        {pending ? "Working…" : submitLabel}
      </button>
    </form>
  );
}
