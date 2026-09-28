"use client";

import { useId, useState } from "react";

/** Single password field with a show-password checkbox (sign-in, etc.). */
export function ShowPasswordField({
  name = "password",
  label = "Password",
  autoComplete = "current-password",
  required = true,
  minLength,
  placeholder,
}: {
  name?: string;
  label?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  placeholder?: string;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const id = useId();

  return (
    <>
      <label
        className="flex flex-col gap-1 text-sm font-medium text-[#0A3D45]"
        htmlFor={id}
      >
        {label}
        <input
          id={id}
          name={name}
          type={showPassword ? "text" : "password"}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className="rowgon-input"
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-[#0A3D45]/80">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[#0A3D45]"
          checked={showPassword}
          onChange={(e) => setShowPassword(e.target.checked)}
        />
        Show password
      </label>
    </>
  );
}
