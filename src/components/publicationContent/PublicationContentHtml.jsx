/**
 * PublicationContentHtml — renders publication content HTML safely.
 *
 * Used by all consumers (About page, Visual Report, Technical Report,
 * Proposal Centre) to render the canonical published HTML identically.
 *
 * Props:
 *  - html: string (HTML content from usePublicationContent)
 *  - variant: 'screen' | 'print' (controls styling context)
 *  - style: object (optional extra styles for the container)
 */
import React from "react";

export default function PublicationContentHtml({ html, variant = "screen", style }) {
  const baseStyle = variant === "print"
    ? {
        fontSize: "10pt",
        lineHeight: 1.6,
        color: "#3E4349",
        textAlign: "left",
      }
    : {
        fontSize: "clamp(14px, 1.1vw, 15.5px)",
        lineHeight: 1.85,
        color: "#3E4349",
      };

  return (
    <div
      style={{ ...baseStyle, ...style }}
      dangerouslySetInnerHTML={{ __html: html || "" }}
    />
  );
}