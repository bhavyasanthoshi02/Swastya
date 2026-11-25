"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/Logo";

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { label: "About", href: "#about" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "Features", href: "#features" },
    { label: "Portals", href: "#portals" },
    { label: "FAQ", href: "#faq" },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-[#053845]/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo Container */}
          <Link
            className="flex items-center gap-3 focus:outline-none focus:ring-2 focus:ring-[#053845] rounded-lg p-1"
            href="#hero"
          >
            <Logo />
          </Link>

          {/* Desktop Navigation Links */}
          <nav aria-label="Main Navigation" className="hidden md:flex items-center space-x-7">
            {navLinks.map((link) => (
              <a
                key={link.label}
                className="text-sm font-medium text-slate-600 hover:text-[#053845] transition-colors"
                href={link.href}
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Right Side CTA Actions (Desktop) */}
          <div className="hidden sm:flex items-center gap-3">
            <Link
              className="px-4 py-1.5 text-sm font-medium text-[#053845] border border-[#053845]/30 rounded-md hover:bg-[#053845]/5 transition-colors focus:ring-2 focus:ring-[#053845] focus:outline-none"
              href="/signin"
            >
              Login
            </Link>
            <Link
              className="px-4 py-1.5 text-sm font-medium text-white bg-[#B94F30] rounded-md shadow-sm hover:bg-[#a14023] transition-all focus:ring-2 focus:ring-[#B94F30] focus:ring-offset-2"
              href="/signup"
            >
              Register
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex items-center gap-2 sm:hidden">
            <Link
              className="px-3 py-1.5 text-xs font-medium text-white bg-[#B94F30] rounded-md shadow-sm hover:bg-[#a14023] transition-all"
              href="/signup"
            >
              Register
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-md text-slate-700 hover:text-[#053845] hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#053845]"
              aria-expanded={mobileMenuOpen}
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-slate-200 bg-white px-4 pt-2 pb-6 space-y-3">
          <nav className="flex flex-col space-y-2">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 text-base font-medium text-slate-700 hover:text-[#053845] hover:bg-slate-50 rounded-md transition-colors"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="pt-3 border-t border-slate-100 flex flex-col gap-2.5">
            <Link
              href="/signin"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full text-center px-4 py-2 text-sm font-medium text-[#053845] border border-[#053845]/30 rounded-md hover:bg-[#053845]/5 transition-colors"
            >
              Login
            </Link>
            <Link
              href="/signup"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full text-center px-4 py-2 text-sm font-medium text-white bg-[#B94F30] rounded-md shadow-sm hover:bg-[#a14023] transition-all"
            >
              Register
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
