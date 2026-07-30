import React, { useState, useMemo } from "react";
import { runStageBIntegrationFixture } from "@/components/room/bass/stageBIntegrationFixture";
import { useAuth } from "@/lib/AuthContext";

export default function StageBValidation() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const handleRun = () => {
    setRunning(true);
    try {
      const r = runStageBIntegrationFixture();
      setResult(r);
    } catch (e) {
      setResult({ error: e?.message || String(e), stack: e?.stack });
    }
    setRunning(false);
  };

  const summary = useMemo(() => {
    if (!result || result.error) return null;
    return { passed: result.passed, failed: result.failed, total: result.total };
  }, [result]);

  if (!isAdmin) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Stage B Validation</h1>
        <p className="text-muted-foreground">This page is restricted to admin users.</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Stage B Integration Validation</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Development-only harness. Runs the real Stage B lifecycle fixture using actual
        production modules (controller, orchestrator, candidate selector, contract publication).
      </p>

      <button
        onClick={handleRun}
        disabled={running}
        className="px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium disabled:opacity-50 mb-4"
      >
        {running ? "Running..." : "Run Stage B Fixture"}
      </button>

      {summary && (
        <div className="mb-4 p-4 rounded-md border">
          <span className="font-semibold">Summary: </span>
          <span className="text-green-600">{summary.passed} passed</span>
          {", "}
          <span className={summary.failed > 0 ? "text-red-600" : "text-green-600"}>
            {summary.failed} failed
          </span>
          {", "}
          <span className="text-muted-foreground">{summary.total} total</span>
        </div>
      )}

      {result?.error && (
        <div className="mb-4 p-4 rounded-md border border-red-500 bg-red-50">
          <div className="font-semibold text-red-700 mb-1">Fixture threw an error:</div>
          <pre className="text-sm whitespace-pre-wrap">{result.error}</pre>
          {result.stack && (
            <pre className="text-xs mt-2 text-muted-foreground whitespace-pre-wrap">{result.stack}</pre>
          )}
        </div>
      )}

      {result?.results && (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2">TEST</th>
              <th className="text-left p-2">EXPECTED</th>
              <th className="text-left p-2">ACTUAL</th>
              <th className="text-center p-2">DELTA</th>
              <th className="text-center p-2">SEVERITY</th>
            </tr>
          </thead>
          <tbody>
            {result.results.map((r, i) => (
              <tr key={i} className={`border-b ${r.severity === "FAIL" ? "bg-red-50" : ""}`}>
                <td className="p-2">{r.test}</td>
                <td className="p-2 text-xs text-muted-foreground">{r.expected}</td>
                <td className="p-2 text-xs">{r.actual}</td>
                <td className="p-2 text-center">{r.delta}</td>
                <td className={`p-2 text-center font-semibold ${r.severity === "PASS" ? "text-green-600" : "text-red-600"}`}>
                  {r.severity}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}