"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  EMAIL_PROVIDERS,
  EMAIL_TLDS,
  applyEmailProvider,
  applyEmailTld,
  emailHasDomain,
} from "@/lib/email-shortcuts";

type EmailFieldProps = {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  readOnly?: boolean;
  id?: string;
};

/**
 * Email input with focus shortcuts for common @providers and .tlds
 * (e.g. @gmail + .com). Use anywhere we collect an email address.
 */
export function EmailField({
  name = "email",
  value: valueControlled,
  defaultValue = "",
  onChange,
  label = (
    <>
      Email{" "}
      <span className="font-normal text-[#0A3D45]/55">(optional)</span>
    </>
  ),
  hint,
  placeholder = "you@example.com",
  required = false,
  autoComplete = "email",
  className,
  inputClassName = "rowgon-input",
  disabled = false,
  readOnly = false,
  id: idProp,
}: EmailFieldProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const inputRef = useRef<HTMLInputElement>(null);
  const [uncontrolled, setUncontrolled] = useState(defaultValue.toLowerCase());
  const [focused, setFocused] = useState(false);
  const controlled = valueControlled !== undefined;
  const value = (controlled ? valueControlled : uncontrolled).toLowerCase();

  function setValue(next: string) {
    const lower = next.toLowerCase();
    if (!controlled) setUncontrolled(lower);
    onChange?.(lower);
  }

  function insertProvider(domain: string) {
    const next = applyEmailProvider(value, domain);
    setValue(next);
    queueMicrotask(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const len = next.length;
      try {
        el.setSelectionRange(len, len);
      } catch {
        /* ignore */
      }
    });
  }

  function insertTld(tld: string) {
    const next = applyEmailTld(value, tld);
    setValue(next);
    queueMicrotask(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const len = next.length;
      try {
        el.setSelectionRange(len, len);
      } catch {
        /* ignore */
      }
    });
  }

  // Keep uncontrolled default in sync if parent remounts with a new default.
  useEffect(() => {
    if (!controlled) setUncontrolled(defaultValue.toLowerCase());
  }, [controlled, defaultValue]);

  const showShortcuts = focused && !disabled && !readOnly;
  const showTlds = showShortcuts && emailHasDomain(value);

  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="flex flex-col gap-1 text-sm font-medium text-[#0A3D45]"
      >
        {label}
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="email"
          inputMode="email"
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required={required}
          disabled={disabled}
          readOnly={readOnly}
          placeholder={placeholder}
          className={inputClassName}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onInput={(e) => {
            // Phones can still insert capitals despite autoCapitalize=none.
            const el = e.currentTarget;
            const lower = el.value.toLowerCase();
            if (el.value !== lower) {
              el.value = lower;
              setValue(lower);
            }
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </label>

      {showShortcuts ? (
        <div
          className="mt-2 space-y-1.5"
          // Keep focus on the input when tapping chips
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="flex flex-wrap gap-1.5">
            {EMAIL_PROVIDERS.map((p) => (
              <button
                key={p.domain}
                type="button"
                className="rounded-full border border-[#0A3D45]/12 bg-white/80 px-2.5 py-1 text-xs font-semibold text-[#0A3D45]/75 transition hover:border-[#1a7a82]/35 hover:bg-[#E8F7F6] hover:text-[#0A3D45]"
                onClick={() => insertProvider(p.domain)}
              >
                {p.label}
              </button>
            ))}
          </div>
          {showTlds ? (
            <div className="flex flex-wrap gap-1.5">
              {EMAIL_TLDS.map((tld) => (
                <button
                  key={tld}
                  type="button"
                  className="rounded-full border border-[#1a7a82]/20 bg-[#E8F7F6]/80 px-2.5 py-1 text-xs font-semibold text-[#1a7a82] transition hover:border-[#1a7a82]/45 hover:bg-[#E8F7F6]"
                  onClick={() => insertTld(tld)}
                >
                  {tld}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {hint ? (
        <p className="mt-1 text-xs leading-relaxed text-[#0A3D45]/60">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Shortcut chips for non-EmailField inputs that can accept an email
 * (e.g. “username or email” invite/reset fields).
 */
export function EmailShortcutChips({
  value,
  onChange,
  visible,
}: {
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
}) {
  if (!visible) return null;
  const showTlds = emailHasDomain(value);

  return (
    <div
      className="space-y-1.5"
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex flex-wrap gap-1.5">
        {EMAIL_PROVIDERS.map((p) => (
          <button
            key={p.domain}
            type="button"
            className="rounded-full border border-[#0A3D45]/12 bg-white/80 px-2.5 py-1 text-xs font-semibold text-[#0A3D45]/75 transition hover:border-[#1a7a82]/35 hover:bg-[#E8F7F6] hover:text-[#0A3D45]"
            onClick={() =>
              onChange(applyEmailProvider(value, p.domain).toLowerCase())
            }
          >
            {p.label}
          </button>
        ))}
      </div>
      {showTlds ? (
        <div className="flex flex-wrap gap-1.5">
          {EMAIL_TLDS.map((tld) => (
            <button
              key={tld}
              type="button"
              className="rounded-full border border-[#1a7a82]/20 bg-[#E8F7F6]/80 px-2.5 py-1 text-xs font-semibold text-[#1a7a82] transition hover:border-[#1a7a82]/45 hover:bg-[#E8F7F6]"
              onClick={() =>
                onChange(applyEmailTld(value, tld).toLowerCase())
              }
            >
              {tld}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
