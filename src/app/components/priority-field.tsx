"use client";

import { useState } from "react";
import { PRIORITY_LABELS, TASK_PRIORITIES } from "@/lib/urgency";

/** Priority select that shows muted hint text until a level is chosen. */
export function PriorityField({
  name = "priority",
  defaultValue = "",
  required = true,
  className,
}: {
  name?: string;
  defaultValue?: string;
  required?: boolean;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const isHint = !value;

  return (
    <select
      name={name}
      required={required}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      aria-label="Priority Level"
      className={`rowgon-input ${isHint ? "rowgon-input-hint" : ""} ${className ?? ""}`}
    >
      <option value="" disabled>
        Priority Level
      </option>
      {TASK_PRIORITIES.map((p) => (
        <option key={p} value={p}>
          {PRIORITY_LABELS[p]}
        </option>
      ))}
    </select>
  );
}
