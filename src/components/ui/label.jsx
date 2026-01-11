import React from "react";

export function Label({ className = "", ...props }) {
  return (
    <span
      className={className}
      {...props}
    />
  );
}

export default Label;