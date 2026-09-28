"use client";

import { useState } from "react";

/** Username input that always stores lowercase (phone + desktop). */
export function UsernameField({
  defaultValue = "",
  className = "rowgon-input",
  placeholder,
  autoComplete = "username",
  required = true,
}: {
  defaultValue?: string;
  className?: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  const [value, setValue] = useState(defaultValue.toLowerCase());

  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-[color:var(--rowgon-deep)]">
      Username
      <input
        name="username"
        required={required}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        inputMode="text"
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value.toLowerCase())}
        onInput={(e) => {
          const el = e.currentTarget;
          const next = el.value.toLowerCase();
          if (el.value !== next) {
            el.value = next;
            setValue(next);
          }
        }}
      />
    </label>
  );
}
