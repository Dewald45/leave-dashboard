import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Leave Dashboard | Media Rocket",
  description: "Company leave applications & approvals",
  icons: { icon: "/brand/mark.svg" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-ZA" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
