import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { Newsreader, Space_Grotesk } from "next/font/google";
import { ConvexClientProvider } from "./ConvexClientProvider";
import { siteUrl } from "./lib/site";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "Witty.Cafe",
    template: "%s | Witty.Cafe",
  },
  description:
    "A cafe for wording ideas, modern media concepts, collections, vibes, and flavours.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Witty.Cafe",
    description:
      "Browse community-ranked collections of ideas, messages, poems, jokes, and creative wording.",
    url: "/",
    siteName: "Witty.Cafe",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body
          className={`${spaceGrotesk.variable} ${newsreader.variable} antialiased`}
        >
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
