export const INTERFACE_FEATURE_KEYS = [
  "pulse",
  "inbox",
  "folderStats",
  "taskHistory",
  "recurrenceChip",
  "sidebarInvite",
  "sidebarRoles",
  "sidebarMembers",
  "onboarding",
] as const;

export type InterfaceFeatureKey = (typeof INTERFACE_FEATURE_KEYS)[number];

export type InterfacePrefMode = "follow" | "show" | "hide";

export type PersonalInterfacePrefs = Record<
  InterfaceFeatureKey,
  InterfacePrefMode
>;

export type WorkspaceInterfaceDefaults = Record<InterfaceFeatureKey, boolean>;

export type EffectiveInterfacePrefs = Record<InterfaceFeatureKey, boolean>;

export const INTERFACE_FEATURE_META: {
  key: InterfaceFeatureKey;
  label: string;
  description: string;
}[] = [
  {
    key: "pulse",
    label: "Pulse strip",
    description: "Open / claimed / review / overdue / done counts at the top.",
  },
  {
    key: "inbox",
    label: "Inbox tabs",
    description: "My claimed and Needs review shortcuts under Pulse.",
  },
  {
    key: "folderStats",
    label: "Folder completion stats",
    description: "Done / total / unclaimed counts on folder cards.",
  },
  {
    key: "taskHistory",
    label: "Task activity / history",
    description: "History toggle on expanded task rows.",
  },
  {
    key: "recurrenceChip",
    label: "Recurrence chip",
    description: "↻ daily / weekly / monthly badge on recurring tasks.",
  },
  {
    key: "sidebarInvite",
    label: "Sidebar: Invite",
    description: "Invite panel in the workspace sidebar (when you can invite).",
  },
  {
    key: "sidebarRoles",
    label: "Sidebar: Roles",
    description: "Custom roles panel in the workspace sidebar.",
  },
  {
    key: "sidebarMembers",
    label: "Sidebar: Members",
    description: "Members list in the workspace sidebar.",
  },
  {
    key: "onboarding",
    label: "Start-here / onboarding",
    description: "Guided setup prompts for new workspaces.",
  },
];

export const APP_INTERFACE_DEFAULTS: EffectiveInterfacePrefs = {
  pulse: true,
  inbox: true,
  folderStats: true,
  taskHistory: true,
  recurrenceChip: true,
  sidebarInvite: true,
  sidebarRoles: true,
  sidebarMembers: true,
  onboarding: true,
};

export function defaultPersonalInterfacePrefs(): PersonalInterfacePrefs {
  return {
    pulse: "follow",
    inbox: "follow",
    folderStats: "follow",
    taskHistory: "follow",
    recurrenceChip: "follow",
    sidebarInvite: "follow",
    sidebarRoles: "follow",
    sidebarMembers: "follow",
    onboarding: "follow",
  };
}

export function defaultWorkspaceInterfaceDefaults(): WorkspaceInterfaceDefaults {
  return { ...APP_INTERFACE_DEFAULTS };
}

function isMode(value: unknown): value is InterfacePrefMode {
  return value === "follow" || value === "show" || value === "hide";
}

export function parsePersonalInterfacePrefs(
  raw: string | null | undefined,
): PersonalInterfacePrefs {
  const base = defaultPersonalInterfacePrefs();
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const key of INTERFACE_FEATURE_KEYS) {
      const value = parsed[key];
      if (isMode(value)) base[key] = value;
    }
  } catch {
    /* ignore corrupt JSON */
  }
  return base;
}

export function parseWorkspaceInterfaceDefaults(
  raw: string | null | undefined,
): WorkspaceInterfaceDefaults {
  const base = defaultWorkspaceInterfaceDefaults();
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const key of INTERFACE_FEATURE_KEYS) {
      if (typeof parsed[key] === "boolean") base[key] = parsed[key];
    }
  } catch {
    /* ignore corrupt JSON */
  }
  return base;
}

export function serializePersonalInterfacePrefs(
  prefs: PersonalInterfacePrefs,
): string {
  return JSON.stringify(prefs);
}

export function serializeWorkspaceInterfaceDefaults(
  prefs: WorkspaceInterfaceDefaults,
): string {
  return JSON.stringify(prefs);
}

/**
 * personal override → workspace default (if applyToMembers) → app default
 */
export function resolveInterfacePrefs(args: {
  personal: PersonalInterfacePrefs;
  workspaceDefaults: WorkspaceInterfaceDefaults;
  applyToMembers: boolean;
}): EffectiveInterfacePrefs {
  const out = { ...APP_INTERFACE_DEFAULTS };
  for (const key of INTERFACE_FEATURE_KEYS) {
    const mode = args.personal[key];
    if (mode === "show") {
      out[key] = true;
    } else if (mode === "hide") {
      out[key] = false;
    } else if (args.applyToMembers) {
      out[key] = args.workspaceDefaults[key];
    } else {
      out[key] = APP_INTERFACE_DEFAULTS[key];
    }
  }
  return out;
}
