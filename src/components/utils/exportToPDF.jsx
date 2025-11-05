
export function exportToPDF({
  projectName,
  selectedSpeaker,
  comparisonSpeaker,
  distance,
  amplifierPower,
  currentSPL,
  requiredPower,
  rp22Target,
  rp22Result,
} = {}) {
  const BRAND = {
    bg: "rgb(248, 248, 247)",
    text: "#1B1A1A",
    subtext: "#3E4349",
    border: "#DCDBD6",
    brandCTA: "#2A6E3F",
    brandCTAHover: "#27633A",
    headerFont: "'Futura PT Light','Century Gothic',sans-serif",
    bodyFont: "'Didact Gothic','Century Gothic',sans-serif",
  };

  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const val = (obj, key) => {
    if (obj == null) return null;
    if (typeof obj === "number") return obj;
    if (typeof obj === "object") {
      const v = obj[key];
      return typeof v === "number" ? v : toNum(v);
    }
    return null;
  };

  const primarySPL = val(currentSPL, "primary");
  const compSPL = val(currentSPL, "comparison");
  const primaryReq = val(requiredPower, "primary");
  const compReq = val(requiredPower, "comparison");

  const printable = document.getElementById("calculator-printable");

  const safeSpeakerRow = (spk, splNum, reqNum) => {
    const sens = toNum(spk?.sensitivity);
    const maxp = toNum(spk?.max_power);
    const price = toNum(spk?.price);
    return `
      <tr>
        <td>${String(spk?.brand || "")} ${String(spk?.model || "")}</td>
        <td>${sens != null ? `${sens} dB @1W/1m` : "-"}</td>
        <td>${maxp != null ? `${maxp} W` : "-"}</td>
        <td>${price != null ? `£${price.toLocaleString()}` : "-"}</td>
        <td>${Number.isFinite(splNum) ? `${splNum.toFixed(1)} dB` : "-"}</td>
        <td>${Number.isFinite(reqNum) ? `${reqNum.toFixed(0)} W` : "-"}</td>
        <td>${rp22Result ? (spk === selectedSpeaker ? (rp22Result.primary ?? "-") : (rp22Result.comparison ?? "-")) : "-"}</td>
      </tr>
    `;
  };

  const rows = [];
  if (selectedSpeaker) rows.push(safeSpeakerRow(selectedSpeaker, primarySPL, primaryReq));
  if (comparisonSpeaker && (comparisonSpeaker.brand || comparisonSpeaker.model)) {
    rows.push(safeSpeakerRow(comparisonSpeaker, compSPL, compReq));
  }

  const now = new Date();
  const win = window.open("", "_blank", "noopener");
  if (!win) return;

  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>SPL Calculator — Export</title>
        <style>
          :root {
            --brand-cta: ${BRAND.brandCTA};
            --brand-cta-hover: ${BRAND.brandCTAHover};
            --ink: ${BRAND.text};
            --sub: ${BRAND.subtext};
            --paper: #FFFFFF;
            --border: ${BRAND.border};
            --bg: ${BRAND.bg};
          }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 24px;
            background: var(--paper);
            color: var(--ink);
            font-family: ${BRAND.bodyFont};
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          h1, h2, h3 {
            margin: 0 0 12px;
            font-family: ${BRAND.headerFont};
          }
          .title {
            color: var(--brand-cta);
            font-size: 22px;
          }
          .panel {
            border: 1px solid var(--border);
            border-radius: 12px;
            background: #fff;
            padding: 16px;
          }
          .meta {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px 16px;
            margin: 12px 0 16px;
          }
          .meta div { font-size: 12px; color: var(--sub); }
          .table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
            margin-top: 8px;
          }
          .table th, .table td {
            border: 1px solid var(--border);
            padding: 8px;
            text-align: left;
            vertical-align: top;
          }
          .table thead th {
            background: rgba(42,110,63,0.12);
            color: var(--ink);
          }
          .footer {
            margin-top: 16px;
            font-size: 10px;
            color: #666;
          }
          .pill {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 999px;
            background: rgba(42,110,63,0.12);
            border: 1px solid var(--border);
            font-size: 11px;
            color: var(--ink);
          }
          @media print {
            .no-print { display: none !important; }
          }
        </style>
      </head>
      <body>
        <div class="panel">
          <h1 class="title">Artcoustic SPL Calculator Report</h1>
          <div class="meta">
            <div><strong>Project:</strong> ${projectName ? String(projectName) : "Untitled"}</div>
            <div><strong>Date:</strong> ${now.toLocaleString()}</div>
            <div><strong>Listening Distance:</strong> ${distance ?? "-"} m</div>
            <div><strong>Amplifier Power:</strong> ${amplifierPower ?? "-"} W</div>
          </div>

          <div style="margin: 8px 0 12px;">
            <span class="pill">RP22 Target: ${rp22Target ?? "-"} dB ${rp22Result && rp22Result.parameter ? `(Param ${rp22Result.parameter})` : ""}</span>
          </div>

          <table class="table">
            <thead>
              <tr>
                <th>Speaker</th>
                <th>Sensitivity</th>
                <th>Max Power</th>
                <th>Price</th>
                <th>Current SPL</th>
                <th>Power Required</th>
                <th>RP22 Result</th>
              </tr>
            </thead>
            <tbody>
              ${rows.join("")}
            </tbody>
          </table>

          <div style="margin-top: 16px;">
            <h2 style="font-size: 16px;">Calculator Snapshot</h2>
            <div class="panel" style="margin-top: 8px;">
              ${printable ? printable.innerHTML : '<div style="color: var(--sub); font-size: 12px;">No embedded calculator snapshot available.</div>'}
            </div>
          </div>

          <div class="footer">
            Exported from Base44 — Artcoustic brand report. Colors and typography match in-app calculator UI.
          </div>
        </div>

        <div class="no-print" style="margin-top: 12px; display: flex; gap: 8px;">
          <button onclick="window.print()" style="padding:10px 14px; background: var(--brand-cta); color:#fff; border:0; border-radius:10px; cursor:pointer;">Print / Save as PDF</button>
          <button onclick="window.close()" style="padding:10px 14px; background:#eee; color:#333; border:1px solid var(--border); border-radius:10px; cursor:pointer;">Close</button>
        </div>

        <script>
          setTimeout(function(){ try { window.print(); } catch(e){} }, 300);
        </script>
      </body>
    </html>
  `;

  win.document.open();
  win.document.write(html);
  win.document.close();
}
