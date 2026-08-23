import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  );
}
