import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jbmono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jbmono" });

export const metadata: Metadata = {
  title: "CVMorph — AI-powered CV formatting",
  description:
    "Upload any candidate CV, review AI-extracted data with confidence scoring, and generate a perfectly formatted CV in your company template — in minutes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${jbmono.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}