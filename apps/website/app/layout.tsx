import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Analytics } from "@vercel/analytics/next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ReactGrab } from "./react-grab";
import { Nudge } from "./__nudge";
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
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://www.expect.dev",
  ),
  title: "Expect",
  description: "Let agents test your code in a real browser.",
  openGraph: {
    title: "Expect",
    description: "Let agents test your code in a real browser.",
    siteName: "Expect",
    url: "https://www.expect.dev",
    images: [
      {
        url: "/og.png",
        width: 1600,
        height: 900,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Expect",
    description: "Let agents test your code in a real browser.",
    images: ["/og.png"],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          themes={["light", "dark"]}
          disableTransitionOnChange
        >
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
        <ReactGrab />
        <Nudge />
        {process.env.VERCEL && <Analytics />}
      </body>
    </html>
  );
}
