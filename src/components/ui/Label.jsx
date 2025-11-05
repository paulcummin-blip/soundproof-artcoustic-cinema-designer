import React from "react";

export default function Label({ children, className = "", htmlFor, ...props }) {
  return (
    <label 
      htmlFor={htmlFor}
      className={`text-sm text-[#3E4349] font-body ${className}`}
      {...props}
    >
      {children}
    </label>
  );
}