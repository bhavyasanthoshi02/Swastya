import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Swastya — Smart Blood Coordination Platform",
  description:
    "Swastya brings hospitals, blood banks, donors, and patients together to make blood requests easier to coordinate, track, and respond to.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,400..700;1,400..700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="min-h-screen flex flex-col bg-white text-slate-800 antialiased selection:bg-[#EFA27E]/30 selection:text-[#053845]"
      >
        {children}
      </body>
    </html>
  );
}
