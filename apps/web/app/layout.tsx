import type { Metadata, Viewport } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const grotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-grotesk",
  weight: ["400", "500", "600", "700"],
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono-type",
  weight: ["400", "500", "700"],
});

const title = "Watchman — Keep the position. Protect the downside.";
const description =
  "Watchman buys short-duration Down Event Contracts on DreamDEX to offset a defined amount of downside on a crypto position, then shows exactly what the hedge did.";

export const metadata: Metadata = {
  metadataBase: new URL("https://watchman.vercel.app"),
  title: { default: title, template: "%s — Watchman" },
  description,
  applicationName: "Watchman",
  keywords: [
    "portfolio insurance",
    "crypto hedging",
    "event contracts",
    "DreamDEX",
    "Somnia",
    "downside protection",
  ],
  openGraph: {
    type: "website",
    siteName: "Watchman",
    title,
    description,
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title, description },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#F7F5F0",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.ReactElement {
  return (
    <html lang="en" className={`${grotesk.variable} ${mono.variable}`}>
      <head>
        {/* Marks scripting as available before first paint so scroll-reveal can
            hide content. Without JS the `.js` class never lands and everything
            stays visible. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.add('js')",
          }}
        />
      </head>
      <body>
        <a
          href="#main"
          className="wm-press sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-yellow focus:px-5 focus:py-3 focus:font-bold focus:text-ink"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
