import React from "react";

const seatId = (seat) => seat.id || `${seat.x}-${seat.y}`;

export default function SeatResponseScopeControls({ rspPosition, orderedSeats = [], selectedSeatIds = [], getSeatColor, onSelectRsp, onSelectSeat, onSelectAll }) {
  const allSelected = orderedSeats.length > 1 && selectedSeatIds.length === orderedSeats.length;
  const rows = orderedSeats.reduce((map, seat) => {
    const row = Number(seat?.row || seat?.rowNumber) || 1;
    if (!map.has(row)) map.set(row, []);
    map.get(row).push(seat);
    return map;
  }, new Map());

  const pillStyle = (active, color) => ({
    minWidth: 52, height: 26, padding: "0 10px", border: active ? `2px solid ${color}` : "1px solid #DCDBD6",
    borderRadius: 9999, fontSize: 11, fontWeight: active ? 700 : 500,
    background: active ? color : "#F6F3EE", color: active ? "#fff" : "#625143",
    cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
  });

  return <div style={{ display: "grid", gap: 5, marginBottom: 12 }}>
    <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
      {rspPosition && <button type="button" onClick={onSelectRsp} style={pillStyle(selectedSeatIds.includes("rsp"), "#16A34A")}>RSP</button>}
      {orderedSeats.length > 1 && <button type="button" onClick={onSelectAll} style={pillStyle(allSelected, "#213428")}>All seats</button>}
      <span style={{ fontSize: 10, color: "#8B7F76", fontFamily: "monospace" }}>Select response to compare raw → EQ → target</span>
    </div>
    {[...rows.entries()].sort(([a], [b]) => a - b).map(([row, seats]) => <div key={row} style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
      {seats.map((seat, index) => {
        const id = seatId(seat);
        const label = `R${row}S${index + 1}`;
        const active = selectedSeatIds.length === 1 && selectedSeatIds[0] === id;
        return <button type="button" key={id} onClick={() => onSelectSeat(id)} title={label} style={pillStyle(active, getSeatColor(id))}>{label}</button>;
      })}
    </div>)}
  </div>;
}