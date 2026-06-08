import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forex AI Terminal — SMC + ICT + 7 Strategies",
  description: "Professional AI-powered forex trading terminal with Smart Money Concepts, ICT analysis, and 7 built-in trading strategies",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ height: '100%' }}>
      <body style={{ height: '100%', margin: 0 }}>{children}</body>
    </html>
  );
}
