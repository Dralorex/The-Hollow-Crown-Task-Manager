import type { Metadata, Viewport } from "next";
import { Fraunces, Nunito } from "next/font/google";
import { MobileViewportReset } from "@/app/components/mobile-viewport-reset";
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

/** Keep the page at 1× on load; pinch-zoom still allowed. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <MobileViewportReset />
        {children}
      </body>
    </html>
  );
}
