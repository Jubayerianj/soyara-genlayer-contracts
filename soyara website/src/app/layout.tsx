import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://soyara.xyz'),
  title: "SOYARA | AI Swapping DEX on GenLayer • Contracts Can Think",
  description: "The world's first AI-native decentralized exchange powered by GenLayer Intelligent Contracts. Non-deterministic execution, validator AI discussions, and unified cross-chain liquidity across GenLayer, Solana, and Sui.",
  keywords: ["Soyara", "GenLayer", "AI DEX", "Intelligent Contracts", "Solana", "Sui", "Crypto Swaps", "DeFi", "app.soyara.xyz", "trade.soyara.xyz"],
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
  openGraph: {
    title: "SOYARA | AI Swapping DEX on GenLayer",
    description: "Contracts Can Think. The world's first AI-native decentralized exchange with GenLayer Intelligent Contracts, Solana & Sui support.",
    url: "https://soyara.xyz",
    siteName: "Soyara",
    images: [
      {
        url: "/logo.png",
        width: 512,
        height: 512,
        alt: "Soyara AI Swapping DEX",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SOYARA | AI Swapping DEX on GenLayer",
    description: "Contracts Can Think. AI Swapping DEX with GenLayer, Solana, and Sui cross-chain liquidity.",
    images: ["/logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col selection:bg-[#0047FF] selection:text-white">
        {children}
      </body>
    </html>
  );
}
