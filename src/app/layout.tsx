import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "KDL Tracker — Kingdao Logistics",
    template: "%s | KDL Tracker",
  },
  description:
    "Real-time import consignment tracking system for Kingdao Logistics. " +
    "Manage the full customs clearance pipeline from vessel arrival to release.",
  robots: { index: false, follow: false }, // internal tool — no indexing
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <head>
        {/*
          No-flash theme. Runs synchronously before first paint and adds the
          `dark` class to <html> so the correct palette is applied on the very
          first frame — no hydration swap, no flicker on navigation. Default is
          light: we only opt into dark when the stored value is exactly "dark".
          The key string MUST stay in sync with THEME_KEY ("kdl-theme") in
          theme-toggle.tsx — this script can't import it (it runs pre-hydration).
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("kdl-theme")==="dark"){document.documentElement.classList.add("dark")}}catch(e){}`,
          }}
        />
      </head>
      <body
        className="min-h-full font-sans antialiased bg-background text-foreground"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
