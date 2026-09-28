import type { Metadata } from "next";
import { Fraunces, Nunito } from "next/font/google";
import { cookies } from "next/headers";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { MobileViewportReset } from "@/app/components/mobile-viewport-reset";
import { THEME_COOKIE, LEGACY_THEME_COOKIE, THEME_MIGRATION_COOKIE, parseDisplayTheme } from "@/lib/theme";
import "./globals.css";

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
});

const body = Nunito({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://rowgon.com"),
  title: "Rowgon Task Manager",
  description:
    "Nested folders, urgency that pulls due tasks up, friends, and private chats.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const cookieStore = await cookies();
  const theme = parseDisplayTheme(
    cookieStore.get(THEME_COOKIE)?.value ??
      cookieStore.get(LEGACY_THEME_COOKIE)?.value,
    { migratedV2: cookieStore.get(THEME_MIGRATION_COOKIE)?.value === "1" },
  );

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${display.variable} ${body.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <MobileViewportReset />
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
