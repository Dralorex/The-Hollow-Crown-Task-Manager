import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DisplayThemeSettings } from "@/app/components/display-theme-settings";
import { InterfaceSettings } from "@/app/components/interface-settings";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parsePersonalInterfacePrefs } from "@/lib/interface-prefs";
import { THEME_COOKIE, LEGACY_THEME_COOKIE, THEME_MIGRATION_COOKIE, parseDisplayTheme } from "@/lib/theme";
import Link from "next/link";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const cookieStore = await cookies();
  const theme = parseDisplayTheme(
    cookieStore.get(THEME_COOKIE)?.value ??
      cookieStore.get(LEGACY_THEME_COOKIE)?.value,
    { migratedV2: cookieStore.get(THEME_MIGRATION_COOKIE)?.value === "1" },
  );

  const prefsRow = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: {
      interfacePrefsJson: true,
      showInterfaceTogglesInWorkspace: true,
    },
  });

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <h1 className="font-[family-name:var(--font-display)] text-3xl text-[color:var(--tide-deep)]">
        Settings
      </h1>
      <p className="mt-2 text-sm text-[color:var(--tide-deep)]/65">
        App preferences for this device and account. Profile details stay under{" "}
        <Link href="/app/profile" className="font-semibold underline-offset-2 hover:underline">
          Profile
        </Link>
        .
      </p>

      <div className="mt-8 space-y-4">
        <InterfaceSettings
          prefs={parsePersonalInterfacePrefs(prefsRow.interfacePrefsJson)}
          showTogglesInWorkspace={prefsRow.showInterfaceTogglesInWorkspace}
        />

        <details className="tide-panel p-5">
          <summary className="cursor-pointer font-semibold text-[color:var(--tide-deep)]">
            Display
          </summary>
          <div className="mt-4">
            <DisplayThemeSettings currentTheme={theme} />
          </div>
        </details>
      </div>
    </main>
  );
}
