import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "TimeOff | Media Rocket",
  description: "Company leave applications & approvals",
  icons: { icon: "/brand/icon.svg", apple: "/app-icon/180.png" },
  // Opened from the home screen, TimeOff runs full screen like an app.
  appleWebApp: { capable: true, title: "TimeOff", statusBarStyle: "default" },
};

// Lets the mobile tab bar sit above the home indicator on notched phones.
export const viewport: Viewport = { viewportFit: "cover", themeColor: "#f5f5f5" };

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
