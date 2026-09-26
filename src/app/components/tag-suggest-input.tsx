"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal, flushSync } from "react-dom";

/** Approx. row height for suggestion buttons (py-1.5 + text-sm). */
const SUGGESTION_ROW_REM = 2.25;
const MAX_VISIBLE_SUGGESTIONS = 6;

function parseDefaultTags(raw: string, allowMultiple: boolean): string[] {
  if (!allowMultiple) return raw.trim() ? [raw.trim()] : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const t = part.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** Text input with a clickable suggestion list of existing tags. */
export function TagSuggestInput({
  tags,
  name = "name",
  placeholder = "Tag",
  defaultValue = "",
  required = false,
  className,
  inputClassName = "rowgon-input text-sm",
  emptyMessage = "No tags yet",
  hint,
  submitOnPick = false,
  clearOptionLabel,
  allowMultiple = false,
  keepOpenOnPick = false,
  /**
   * When true with allowMultiple, use chip UI. Tags commit on suggestion
   * pick or blur (phone Done) — not Enter, which advances focus like Tab.
   */
  commitTagOnEnter = false,
  /** Optional marker on the visible input for onboarding focus targets. */
  dataOnboarding,
  /**
   * Fired when a tag/role is actually committed (chip added, suggestion
   * picked, or blur-applied) — not on every keystroke or bare Enter.
   */
  onCommittedTagsChange,
}: {
  tags: string[];
  name?: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  className?: string;
  inputClassName?: string;
  emptyMessage?: string;
  /** Short helper under the field (e.g. comma-separated tip). */
  hint?: string;
  /** When true, picking a tag submits the parent form (for GET filters). */
  submitOnPick?: boolean;
  clearOptionLabel?: string;
  /** Allow comma-separated tags; suggestions match the last segment. */
  allowMultiple?: boolean;
  /**
   * When picking with allowMultiple, keep the menu open and append ", "
   * so another tag can be typed. Closes only if the tag is already selected.
   */
  keepOpenOnPick?: boolean;
  commitTagOnEnter?: boolean;
  dataOnboarding?: string;
  onCommittedTagsChange?: (tags: string[]) => void;
}) {
  const useChips = Boolean(commitTagOnEnter && allowMultiple);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(defaultValue);
  const [chips, setChips] = useState<string[]>(() =>
    useChips ? parseDefaultTags(defaultValue, true) : [],
  );
  const [draft, setDraft] = useState("");
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const segments = allowMultiple && !useChips ? value.split(",") : [value];
  const head = allowMultiple && !useChips
    ? segments
        .slice(0, -1)
        .map((s) => s.trim())
        .filter(Boolean)
    : useChips
      ? chips
      : [];
  const activeQuery = useChips
    ? draft.trim().toLowerCase()
    : (segments[segments.length - 1] ?? "").trim().toLowerCase();
  const taken = new Set(head.map((s) => s.toLowerCase()));

  const filtered = tags.filter((t) => {
    const lower = t.toLowerCase();
    if (taken.has(lower)) return false;
    if (!activeQuery) return true;
    return lower.includes(activeQuery);
  });

  const formValue = useChips
    ? [...chips, ...(draft.trim() ? [draft.trim()] : [])].join(", ")
    : value;

  const onCommittedTagsChangeRef = useRef(onCommittedTagsChange);
  onCommittedTagsChangeRef.current = onCommittedTagsChange;

  function emitCommitted(list: string[]) {
    onCommittedTagsChangeRef.current?.(list);
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (useChips) {
      setChips(parseDefaultTags(defaultValue, true));
      setDraft("");
    } else {
      setValue(defaultValue);
    }
  }, [defaultValue, useChips]);

  // Chip mode: notify when the committed chip list changes (pick / blur / Enter).
  useEffect(() => {
    if (!useChips) return;
    emitCommitted(chips);
  }, [chips, useChips]);

  const place = useCallback(() => {
    const input = inputRef.current;
    const panel = panelRef.current;
    if (!input || !panel) return;
    const rect = input.getBoundingClientRect();
    const panelHeight = panel.offsetHeight || 0;
    const gap = 4;
    let top = rect.bottom + gap;
    if (
      top + panelHeight > window.innerHeight - 8 &&
      rect.top > panelHeight + gap
    ) {
      top = rect.top - panelHeight - gap;
    }
    setCoords({
      top,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
      width: rect.width,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    place();
    const onReposition = () => place();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, place, filtered.length, value, draft, chips, clearOptionLabel]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Phone “Done” / check dismisses the keyboard via blur — close the menu then.
  // Delay so tapping a suggestion (mousedown → click) still registers first.
  const blurCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (blurCloseTimer.current) clearTimeout(blurCloseTimer.current);
    };
  }, []);

  function commitTypedTagFromInput() {
    const piece = (inputRef.current?.value ?? "").trim();
    if (!piece) return;

    if (useChips) {
      addChip(piece, false);
      return;
    }

    if (!allowMultiple) {
      emitCommitted(parseDefaultTags(piece, false));
      return;
    }

    const current = inputRef.current?.value ?? value;
    const parts = current.split(",");
    const last = (parts[parts.length - 1] ?? "").trim();
    if (!last) return;
    const prior = parts
      .slice(0, -1)
      .map((s) => s.trim())
      .filter(Boolean);
    if (prior.some((p) => p.toLowerCase() === last.toLowerCase())) {
      setValue(prior.join(", "));
      emitCommitted(prior);
      return;
    }
    const next = [...prior, last];
    setValue(next.join(", "));
    emitCommitted(next);
  }

  function scheduleCloseOnBlur() {
    if (blurCloseTimer.current) clearTimeout(blurCloseTimer.current);
    blurCloseTimer.current = setTimeout(() => {
      blurCloseTimer.current = null;
      if (pickingRef.current) return;
      if (document.activeElement === inputRef.current) return;
      // Phone Done/check dismisses the keyboard via blur — apply typed tags.
      commitTypedTagFromInput();
      setOpen(false);
    }, 160);
  }

  function cancelBlurClose() {
    if (blurCloseTimer.current) {
      clearTimeout(blurCloseTimer.current);
      blurCloseTimer.current = null;
    }
  }
  function commit(next: string, submit: boolean) {
    flushSync(() => {
      setValue(next);
      setOpen(false);
    });
    emitCommitted(parseDefaultTags(next, allowMultiple));
    if (submit) {
      inputRef.current?.form?.requestSubmit();
    }
  }

  function addChip(tag: string, keepOpen: boolean) {
    const trimmed = tag.trim();
    if (!trimmed) return;
    let added = false;
    setChips((prev) => {
      if (prev.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
        return prev;
      }
      added = true;
      return [...prev, trimmed];
    });
    setDraft("");
    if (keepOpen && added) {
      setOpen(true);
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        place();
      });
    } else if (!keepOpen) {
      setOpen(false);
    }
  }

  function removeChip(tag: string) {
    setChips((prev) => prev.filter((t) => t.toLowerCase() !== tag.toLowerCase()));
  }

  function pickSuggestion(tag: string) {
    if (useChips) {
      addChip(tag, Boolean(keepOpenOnPick));
      return;
    }

    if (!allowMultiple) {
      commit(tag, Boolean(submitOnPick));
      return;
    }

    if (taken.has(tag.toLowerCase())) {
      setOpen(false);
      return;
    }

    if (keepOpenOnPick) {
      const committed = [...head, tag];
      const next = `${committed.join(", ")}, `;
      setValue(next);
      emitCommitted(committed);
      setOpen(true);
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        const end = el.value.length;
        el.setSelectionRange(end, end);
        place();
      });
      return;
    }

    const next = [...head, tag].join(", ");
    commit(next, Boolean(submitOnPick));
  }

  function onEnterKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    // Never commit or submit on Enter — parent create forms treat Enter as
    // Tab. Tags/roles are added via suggestion pick or blur (phone Done).
    if (e.nativeEvent.isComposing) return;
    if (!commitTagOnEnter && !allowMultiple) return;
    e.preventDefault();
  }

  const listMaxHeight = `${MAX_VISIBLE_SUGGESTIONS * SUGGESTION_ROW_REM}rem`;

  const dropdown =
    mounted && open
      ? createPortal(
          <div
            ref={panelRef}
            id={listId}
            role="listbox"
            className="fixed z-[200] overflow-hidden"
            style={{
              top: coords?.top ?? 0,
              left: coords?.left ?? 0,
              width: coords?.width ?? undefined,
              visibility: coords ? "visible" : "hidden",
            }}
          >
            <div className="rowgon-menu-popover overflow-hidden rounded-lg py-1">
            {clearOptionLabel && (useChips ? chips.length > 0 || draft.trim() : value.trim()) ? (
              <button
                type="button"
                role="option"
                className="block w-full px-3 py-1.5 text-left text-xs text-[#0A3D45]/60 hover:bg-[#0A3D45]/[0.06]"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickingRef.current = true;
                  cancelBlurClose();
                }}
                onClick={() => {
                  pickingRef.current = false;
                  if (useChips) {
                    setChips([]);
                    setDraft("");
                    setOpen(false);
                    if (submitOnPick) inputRef.current?.form?.requestSubmit();
                  } else {
                    commit("", Boolean(submitOnPick));
                  }
                }}
              >
                {clearOptionLabel}
              </button>
            ) : null}
            <div className="overflow-y-auto" style={{ maxHeight: listMaxHeight }}>
              {filtered.length === 0 ? (
                <p className="px-3 py-2 text-xs text-[#0A3D45]/55">
                  {tags.length === 0 ||
                  (tags.length > 0 && taken.size >= tags.length && !activeQuery)
                    ? emptyMessage
                    : activeQuery
                      ? "No matching tags"
                      : emptyMessage}
                </p>
              ) : (
                filtered.map((tag) => {
                  const selected = tag.toLowerCase() === activeQuery;
                  return (
                    <button
                      key={tag}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-[#0A3D45]/[0.06] ${
                        selected
                          ? "font-semibold text-[#0A3D45]"
                          : "text-[#0A3D45]/80"
                      }`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pickingRef.current = true;
                        cancelBlurClose();
                      }}
                      onClick={() => {
                        pickingRef.current = false;
                        pickSuggestion(tag);
                      }}
                    >
                      {tag}
                    </button>
                  );
                })
              )}
            </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={className}>
      <div ref={wrapRef} className="relative space-y-1.5">
        {useChips && chips.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {chips.map((tag) => (
              <li key={tag.toLowerCase()}>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md bg-[#0A3D45]/8 px-2 py-0.5 text-xs font-medium text-[#0A3D45]"
                  onClick={() => removeChip(tag)}
                  aria-label={`Remove tag ${tag}`}
                >
                  {tag}
                  <span aria-hidden className="text-[#0A3D45]/45">
                    ×
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {useChips ? (
          <input type="hidden" name={name} value={formValue} />
        ) : null}
        <input
          ref={inputRef}
          name={useChips ? undefined : name}
          data-onboarding={dataOnboarding}
          value={useChips ? draft : value}
          required={required && !(useChips ? formValue.trim() : value.trim())}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          placeholder={placeholder}
          className={inputClassName}
          onChange={(e) => {
            if (useChips) setDraft(e.target.value);
            else setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            cancelBlurClose();
            setOpen(true);
          }}
          onClick={() => setOpen(true)}
          onBlur={scheduleCloseOnBlur}
          onKeyDown={onEnterKey}
        />
      </div>
      {hint ? (
        <p className="mt-1 text-[11px] leading-snug text-[#0A3D45]/55">{hint}</p>
      ) : null}
      {dropdown}
    </div>
  );
}
