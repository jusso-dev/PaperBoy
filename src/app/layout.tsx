import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PaperBoy",
  description: "Self-hosted transactional email. A cheaper Resend you run on your own box.",
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
