import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3000"),
  title: "Makro",
  description: "Turkey macro data workspace seeded from curated SQL definitions.",
  openGraph: {
    title: "Makro",
    description: "Turkey macro data workspace seeded from curated SQL definitions.",
    siteName: "Makro",
  },
  twitter: {
    card: "summary_large_image",
    title: "Makro",
    description: "Turkey macro data workspace seeded from curated SQL definitions.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
