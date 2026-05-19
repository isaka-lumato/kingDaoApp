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
      <body className="min-h-full font-sans antialiased bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
