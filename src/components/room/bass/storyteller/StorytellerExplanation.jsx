// StorytellerExplanation.jsx
//
// A text panel below the bass response graph that explains "Here's why" for
// the current parameter or seat focus. It consumes the explanation object
// built by buildParameterFocus and renders it as a clear, structured summary.
//
// When no parameter or seat is focused, it shows a prompt to click a parameter
// or seat to see the explanation.

import React from "react";
import { Info } from "lucide-react";

export default function StorytellerExplanation({ focus }) {
  if (!focus || !focus.explanation) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px solid #DCDBD6",
          background: "#F8F8F7",
          fontSize: 11,
          color: "#625143",
          fontFamily: "Didact Gothic, sans-serif",
        }}
      >
        <Info style={{ width: 14, height: 14, color: "#8B7F76", flexShrink: 0 }} />
        <span>
          Click <strong>P14</strong>, <strong>P18</strong>, <strong>P19</strong>, or{" "}
          <strong>P20</strong> above, or select a seat, to see the graph explain
          the published result.
        </span>
      </div>
    );
  }

  const { title, subtitle, lines, seatPillLabel, limitingFrequencyHz } = focus.explanation;

  return (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: 8,
        border: "1px solid #DCDBD6",
        background: "#FFFFFF",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <Info
          style={{
            width: 16,
            height: 16,
            color: "#213428",
            flexShrink: 0,
            marginTop: 1,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#1B1A1A",
              fontFamily: "Didact Gothic, sans-serif",
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                fontSize: 11,
                color: "#625143",
                marginTop: 2,
                fontFamily: "Didact Gothic, sans-serif",
              }}
            >
              {subtitle}
            </div>
          )}
          {seatPillLabel && (
            <div
              style={{
                marginTop: 8,
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  minWidth: 52,
                  height: 26,
                  padding: "0 10px",
                  border: "2px solid #213428",
                  borderRadius: 9999,
                  fontSize: 11,
                  fontWeight: 700,
                  background: "#213428",
                  color: "#fff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "Didact Gothic, sans-serif",
                  flexShrink: 0,
                }}
              >
                {seatPillLabel}
              </span>
              {limitingFrequencyHz != null && (
                <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "#625143",
                      fontFamily: "Didact Gothic, sans-serif",
                    }}
                  >
                    Limiting frequency
                  </span>
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: "#1B1A1A",
                      fontFamily: "Didact Gothic, sans-serif",
                    }}
                  >
                    {limitingFrequencyHz} Hz
                  </span>
                </div>
              )}
            </div>
          )}
          {Array.isArray(lines) && lines.length > 0 && (
            <ul
              style={{
                margin: "6px 0 0",
                padding: 0,
                listStyle: "none",
                display: "flex",
                flexWrap: "wrap",
                gap: "4px 14px",
              }}
            >
              {lines.map((line, index) => (
                <li
                  key={index}
                  style={{
                    fontSize: 11,
                    color: "#3E4349",
                    fontFamily: "Didact Gothic, sans-serif",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span
                    style={{
                      width: 3,
                      height: 3,
                      borderRadius: "50%",
                      background: "#625143",
                      flexShrink: 0,
                    }}
                  />
                  {line}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}