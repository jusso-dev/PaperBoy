import type { Metadata } from "next";
import { Bree_Serif, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const displayFont = Bree_Serif({
  display: "swap",
  subsets: ["latin"],
  variable: "--paperboy-font-display",
  weight: "400",
});

const monoFont = IBM_Plex_Mono({
  display: "swap",
  subsets: ["latin"],
  variable: "--paperboy-font-mono",
  weight: ["400", "500", "600", "700"],
});

const title = "PaperBoy";
const description =
  "Self-hosted transactional email. A cheaper Resend you run on your own box.";
const banner = {
  url: "https://raw.githubusercontent.com/jusso-dev/PaperBoy/main/docs/banner.jpg",
  width: 607,
  height: 405,
  alt: "PaperBoy self-hosted transactional email banner",
};

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    type: "website",
    images: [banner],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [banner],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={`${displayFont.variable} ${monoFont.variable}`} lang="en-AU">
      <body>{children}</body>
    </html>
  );
}
