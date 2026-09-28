"use client";

import { TagSuggestInput } from "@/app/components/tag-suggest-input";

/** Tag filter input with a clickable list of tags in scope. */
export function TagFilterField({
  tags,
  name = "tag",
  defaultValue = "",
  className,
}: {
  tags: string[];
  name?: string;
  defaultValue?: string;
  className?: string;
}) {
  return (
    <TagSuggestInput
      tags={tags}
      name={name}
      defaultValue={defaultValue}
      className={className}
      placeholder="Tag filter"
      inputClassName="rowgon-input min-w-[12rem] w-48"
      emptyMessage="No tags in this folder yet"
      allowMultiple
      keepOpenOnPick
      clearOptionLabel="Clear tag filter"
    />
  );
}
