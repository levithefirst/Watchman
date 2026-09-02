import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Watchman", description: "Short-duration portfolio insurance for crypto positions." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>): React.ReactElement {
  return <html lang="en"><body>{children}</body></html>;
}
