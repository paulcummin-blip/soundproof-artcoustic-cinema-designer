import React from "react";

export function Label({ children, className = "", htmlFor, ...props }) {
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

export default Label;