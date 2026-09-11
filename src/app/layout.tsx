import type { Metadata } from "next";
import { DM_Sans, Cormorant_Garamond } from "next/font/google";
import "./globals.css";
const sans = DM_Sans({ subsets: ["latin"], variable: "--font-sans" });
const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-serif",
});
export const metadata: Metadata = {
  title: "The Framing Studio — Expressions & Images",
  description:
    "Make something worth keeping. An interactive custom framing demo, inspired by Expressions & Images in Edmonton.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${serif.variable}`}>{children}</body>
    </html>
  );
}
