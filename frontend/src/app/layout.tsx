import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

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
      <body
        className={`${inter.variable} ${playfair.variable} min-h-screen flex flex-col bg-white text-slate-800 antialiased selection:bg-[#EFA27E]/30 selection:text-[#053845]`}
      >
        {children}
      </body>
    </html>
  );
}
