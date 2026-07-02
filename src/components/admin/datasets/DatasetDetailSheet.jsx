import React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import DatasetStatusBadge from "@/components/admin/datasets/DatasetStatusBadge";

const BRAND = { text: "#1B1A1A", subtext: "#3E4349", border: "#DCDBD6" };

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.subtext, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color: BRAND.text }}>{children}</div>
    </div>
  );
}

export default function DatasetDetailSheet({ row, open, onOpenChange }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        {row && (
          <>
            <SheetHeader>
              <SheetTitle>{row.datasetName}</SheetTitle>
            </SheetHeader>

            <div style={{ marginTop: 20 }}>
              <Section title="General">
                <div>Speaker: {row.speaker}</div>
                <div style={{ marginTop: 4 }}>Status: <DatasetStatusBadge label={row.statusLabel} tone={row.statusTone} /></div>
              </Section>

              <Section title="Metadata">
                {Object.keys(row.metadata).length ? (
                  <pre style={{ background: "#F8F8F7", border: `1px solid ${BRAND.border}`, borderRadius: 8, padding: 12, fontSize: 12, overflowX: "auto" }}>
                    {JSON.stringify(row.metadata, null, 2)}
                  </pre>
                ) : "No metadata.json found."}
              </Section>

              <Section title="Horizontal Angles">
                {row.validation.horizontalAngles.length ? row.validation.horizontalAngles.join("°, ") + "°" : "None discovered."}
              </Section>

              <Section title="Vertical Angles">
                {row.validation.verticalAngles.length ? row.validation.verticalAngles.join("°, ") + "°" : "None discovered."}
              </Section>

              <Section title="Validation Results">
                <div style={{ marginBottom: 6 }}>Result: <DatasetStatusBadge label={row.statusLabel} tone={row.statusTone} /></div>
                {row.validation.messages.length ? (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {row.validation.messages.map((m, i) => <li key={i} style={{ marginBottom: 4 }}>{m}</li>)}
                  </ul>
                ) : "No issues found."}
              </Section>

              <Section title="Developer Notes">
                {row.metadata?.notes || "—"}
              </Section>

              <Section title="Health Check">
                <div style={{ marginBottom: 6 }}>
                  <DatasetStatusBadge label={row.healthLabel} tone={row.healthTone} />
                </div>
                {row.validation.messages.length ? (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {row.validation.messages.map((m, i) => <li key={i} style={{ marginBottom: 4 }}>{m}</li>)}
                  </ul>
                ) : "No warnings."}
              </Section>

              <Section title="Actions">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <Button variant="outline" disabled>Validate</Button>
                  <Button variant="outline" disabled>Refresh</Button>
                  <Button variant="outline" disabled>Export Metadata</Button>
                  <Button variant="outline" disabled>View Raw Dataset</Button>
                </div>
              </Section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}