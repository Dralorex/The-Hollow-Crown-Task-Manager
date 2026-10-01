"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  INTERFACE_FEATURE_KEYS,
  parsePersonalInterfacePrefs,
  serializePersonalInterfacePrefs,
  type InterfaceFeatureKey,
  type InterfacePrefMode,
} from "@/lib/interface-prefs";
import {
  THEME_COOKIE,
  LEGACY_THEME_COOKIE,
  THEME_MIGRATION_COOKIE,
  isDisplayThemeId,
  type DisplayThemeId,
} from "@/lib/theme";
import type { ActionResult } from "@/app/actions/auth";

export async function setDisplayThemeAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireUser();
  const theme = String(formData.get("theme") ?? "");
  if (!isDisplayThemeId(theme)) {
    return { ok: false, error: "Unknown display mode." };
  }

  const cookieStore = await cookies();
  const cookieOpts = {
    httpOnly: false,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365 * 5,
  };

  cookieStore.set(THEME_COOKIE, theme as DisplayThemeId, cookieOpts);
  // After first explicit save, `burn` means dark-ember Burn (not legacy soft).
  cookieStore.set(THEME_MIGRATION_COOKIE, "1", cookieOpts);
  cookieStore.delete(LEGACY_THEME_COOKIE);

  revalidatePath("/", "layout");
  return { ok: true };
}

function isFeatureKey(value: string): value is InterfaceFeatureKey {
  return (INTERFACE_FEATURE_KEYS as readonly string[]).includes(value);
}

function isPrefMode(value: string): value is InterfacePrefMode {
  return value === "follow" || value === "show" || value === "hide";
}

export async function updatePersonalInterfacePrefAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const feature = String(formData.get("feature") ?? "");
  const mode = String(formData.get("mode") ?? "");
  if (!isFeatureKey(feature) || !isPrefMode(mode)) {
    return { ok: false, error: "Unknown interface preference." };
  }

  const current = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { interfacePrefsJson: true },
  });
  const prefs = parsePersonalInterfacePrefs(current.interfacePrefsJson);
  prefs[feature] = mode;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      interfacePrefsJson: serializePersonalInterfacePrefs(prefs),
    },
  });

  revalidatePath("/app/settings");
  revalidatePath("/app", "layout");
  revalidatePath("/app/w", "layout");
  return { ok: true };
}

export async function updateShowInterfaceTogglesInWorkspaceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const enabled = String(formData.get("enabled") ?? "0") === "1";

  await prisma.user.update({
    where: { id: user.id },
    data: { showInterfaceTogglesInWorkspace: enabled },
  });

  revalidatePath("/app/settings");
  revalidatePath("/app", "layout");
  revalidatePath("/app/w", "layout");
  return { ok: true };
}
