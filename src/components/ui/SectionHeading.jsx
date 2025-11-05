import React from "react";

export default function SectionHeading({ children, className = "" }) {
  return (
    <h3 className={`text-xl uppercase tracking-wider font-header mb-2 text-[#1B1A1A] ${className}`}>
      {children}
    </h3>
  );
}