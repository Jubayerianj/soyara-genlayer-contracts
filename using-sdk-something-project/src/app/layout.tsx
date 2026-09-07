import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Soyara Keeper | Intent-Based Limit Orders on GenLayer',
  description: 'AI-native intent-based limit order & conditional trigger keeper on GenLayer Bradbury Testnet using Soyara SDK and Viem.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-slate-100 min-h-screen antialiased selection:bg-cyan-500 selection:text-black">
        {children}
      </body>
    </html>
  );
}
