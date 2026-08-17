// PurchaseProjects — pilot placeholder for the future Stripe checkout entry point.
//
// Displays the three intended product packs without prices or payment.
// Directs pilot users to contact Sound Proof for additional Professional Projects.

import React from "react";
import { useNavigate } from "react-router-dom";

const PACKS = [
  { count: 5, label: "5 Professional Projects" },
  { count: 20, label: "20 Professional Projects" },
  { count: 100, label: "100 Professional Projects" },
];

export default function PurchaseProjects() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        padding: 24,
        minHeight: "100vh",
        background: "rgb(248 248 247)",
        color: "#1B1A1A",
      }}
    >
      <h1 style={{ fontSize: 28, marginBottom: 8, color: "#1B1A1A" }}>
        Purchase Professional Projects
      </h1>
      <p style={{ color: "#3E4349", marginBottom: 24, fontSize: 14 }}>
        Online purchasing is being prepared.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {PACKS.map((pack) => (
          <div
            key={pack.count}
            style={{
              background: "#FFFFFF",
              border: "1px solid #DCDBD6",
              borderRadius: 12,
              padding: 20,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1B1A1A" }}>
              {pack.label}
            </div>
            <div style={{ fontSize: 13, color: "#3E4349", marginTop: 8 }}>
              Pricing available soon.
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: 16,
          background: "#FFFFFF",
          border: "1px solid #DCDBD6",
          borderRadius: 10,
          fontSize: 14,
          color: "#3E4349",
          marginBottom: 20,
        }}
      >
        For additional Professional Projects during the pilot, please contact
        Sound Proof.
      </div>

      <button
        type="button"
        onClick={() => navigate("/Projects")}
        style={{
          padding: "12px 20px",
          borderRadius: 10,
          border: "1px solid #DCDBD6",
          background: "#1B1A1A",
          color: "#FFFFFF",
          cursor: "pointer",
          fontSize: 14,
        }}
      >
        Return to Projects
      </button>
    </div>
  );
}