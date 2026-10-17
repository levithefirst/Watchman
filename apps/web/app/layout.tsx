import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

const description = "Give Watchman one tightly scoped exit rule for your ETH. PayBox holds the authority; Watchman can only do exactly what you approve.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Watchman — Protect your position while you're away", template: "%s · Watchman" },
  description,
  applicationName: "Watchman",
  openGraph: { type: "website", siteName: "Watchman", title: "Watchman", description },
  twitter: { card: "summary", title: "Watchman", description },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0d" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>): React.ReactElement {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
