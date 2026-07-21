import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Unit Function Exam — Operator Training & Assessment",
  description: "Professional operator training and assessment platform.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-surface font-sans">{children}</body>
    </html>
  );
}
