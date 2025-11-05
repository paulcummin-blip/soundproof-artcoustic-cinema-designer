import React, { useState } from "react";
import { __devTest, setApiKey, getApiKey } from "../net/api";

export default function ApiSelfTest() {
  const [logs, setLogs] = useState([]);
  const [key, setKey] = useState(getApiKey() || "");

  function push(line) {
    setLogs((l) => [line, ...l].slice(0, 200));
    if (typeof window !== "undefined") {
      window.__APP_DEBUG = window.__APP_DEBUG || [];
      window.__APP_DEBUG.push(line);
    }
  }

  async function run(label, fn) {
    if (typeof fn !== "function") {
      push(`[${new Date().toISOString()}] ${label}: unavailable`);
      return;
    }
    try {
      push(`[${new Date().toISOString()}] ${label}: running…`);
      const res = await fn();
      push(
        `[${new Date().toISOString()}] ${label} ${res?.ok ? "OK" : "FAIL"} (${res?.status ?? "-"}) ${res?.error ? res.error : `items=${res?.items}`} in ${res?.ms ?? "?"}ms`
      );
    } catch (e) {
      push(`[${new Date().toISOString()}] ${label}: threw ${e?.message || e}`);
    }
  }

  return (
    <div className="mt-6 border border-[#DCDBD6] rounded-lg p-4 bg-white">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-3">
        <div className="flex-1">
          <label className="block text-sm mb-1 text-[#3E4349]">API Key</label>
          <div className="flex gap-2">
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="BASE44_API_KEY…"
              className="bg-white border border-[#DCDBD6] rounded px-3 py-2 text-sm w-full"
            />
            <button
              className="px-3 py-2 rounded bg-[#1B1A1A] text-white text-sm"
              onClick={() => {
                setApiKey(key);
                push(`[${new Date().toISOString()}] KEY: saved (length ${key?.length || 0})`);
              }}
            >
              Save Key
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-2 border border-[#DCDBD6] rounded text-sm" onClick={() => run("HAPPY", __devTest?.happy)}>Happy</button>
          <button className="px-3 py-2 border border-[#DCDBD6] rounded text-sm" onClick={() => run("PARSE", __devTest?.parse)}>Parse</button>
          <button className="px-3 py-2 border border-[#DCDBD6] rounded text-sm" onClick={() => run("TIMEOUT", __devTest?.timeout)}>Timeout</button>
        </div>
      </div>

      <pre className="bg-[#F8F8F7] border border-[#DCDBD6] rounded p-3 text-xs font-mono overflow-auto max-h-64">
        {logs.length ? logs.join("\n") : "Click a test to run…"}
      </pre>
    </div>
  );
}