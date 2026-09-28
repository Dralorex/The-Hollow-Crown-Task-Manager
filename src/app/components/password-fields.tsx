"use client";

import { useId, useState } from "react";

/** Password + confirm fields with a show-password checkbox under the first field. */
export function PasswordFields({
  passwordLabel = "Password",
  confirmLabel = "Confirm password",
  autoComplete = "new-password",
  placeholder = "At least 8 characters",
}: {
  passwordLabel?: string;
  confirmLabel?: string;
  autoComplete?: string;
  placeholder?: string;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const confirmId = useId();
  const inputType = showPassword ? "text" : "password";
  const mismatch = confirm.length > 0 && password !== confirm;

  return (
    <>
      <label className="flex flex-col gap-1 text-sm font-medium text-[#0A3D45]">
        {passwordLabel}
        <input
          name="password"
          type={inputType}
          required
          minLength={8}
          autoComplete={autoComplete}
          className="rowgon-input"
          placeholder={placeholder}
          value={password}
          onChange={(e) => {
            const value = e.target.value;
            setPassword(value);
            const confirmEl = document.getElementById(confirmId) as HTMLInputElement | null;
            if (confirmEl) {
              confirmEl.setCustomValidity(
                confirm.length > 0 && value !== confirm ? "Passwords don’t match." : "",
              );
            }
          }}
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
      <label className="flex flex-col gap-1 text-sm font-medium text-[#0A3D45]" htmlFor={confirmId}>
        {confirmLabel}
        <input
          id={confirmId}
          name="passwordConfirm"
          type={inputType}
          required
          minLength={8}
          autoComplete={autoComplete}
          className="rowgon-input"
          placeholder="Re-enter password"
          value={confirm}
          onChange={(e) => {
            const value = e.target.value;
            setConfirm(value);
            e.target.setCustomValidity(
              value.length > 0 && password !== value ? "Passwords don’t match." : "",
            );
          }}
          aria-invalid={mismatch || undefined}
        />
      </label>
      {mismatch ? (
        <p className="text-xs text-[#9b2f22]">Passwords don’t match.</p>
      ) : null}
    </>
  );
}
