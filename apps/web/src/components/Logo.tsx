import React from "react";
import Image from "next/image";

interface LotusIconProps {
  className?: string;
  alt?: string;
  priority?: boolean;
}

export function LotusIcon({
  className = "h-8 w-auto",
  alt = "Swastya Lotus Emblem",
  priority = true,
}: LotusIconProps) {
  return (
    <Image
      src="/swastya-logo.svg"
      alt={alt}
      width={70}
      height={50}
      className={`object-contain ${className}`}
      priority={priority}
    />
  );
}

interface LogoProps {
  variant?: "default" | "footer";
  className?: string;
  showText?: boolean;
}

export function Logo({ variant = "default", className = "", showText = true }: LogoProps) {
  if (variant === "footer") {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <Image
          src="/swastya-logo.svg"
          alt="Swastya Lotus Logo"
          width={70}
          height={50}
          className="h-9 w-auto object-contain flex-shrink-0 brightness-110 drop-shadow-[0_1px_3px_rgba(255,255,255,0.25)]"
          priority
        />
        {showText && (
          <div className="flex flex-col text-left">
            <span className="font-serif text-2xl font-bold tracking-tight text-[#EFA27E] leading-none">
              Swastya
            </span>
            <span className="text-[9px] tracking-widest uppercase font-semibold text-[#EFA27E]/80 mt-1">
              PEOPLE • CARE • TOGETHER
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <Image
        src="/swastya-logo.svg"
        alt="Swastya Lotus Logo"
        width={70}
        height={50}
        className="h-8 w-auto object-contain flex-shrink-0"
        priority
      />
      {showText && (
        <div className="flex flex-col text-left">
          <span className="font-serif text-xl font-bold tracking-tight text-[#053845] leading-none">
            Swastya
          </span>
          <span className="text-[9px] tracking-widest uppercase font-semibold text-[#317786] mt-0.5">
            PEOPLE • CARE • TOGETHER
          </span>
        </div>
      )}
    </div>
  );
}
