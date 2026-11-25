import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'IPL Live Auction Simulator',
  description: 'Single-player AI & real-time multiplayer IPL auction simulator',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#070b14] text-slate-100 antialiased selection:bg-amber-400 selection:text-slate-950">
        {children}
      </body>
    </html>
  );
}
