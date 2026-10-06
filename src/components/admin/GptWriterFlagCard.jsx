import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  card: "#FFFFFF",
  accent: "#625143",
  btn: "#1B1A1A",
  btnText: "#FFFFFF",
  warning: "#B23A3A",
};

const LABEL = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: BRAND.accent,
  marginBottom: 4,
};

const FIELD = {
  width: "100%",
  padding: "8px 10px",
  border: `1px solid ${BRAND.border}`,
  borderRadius: 8,
  fontSize: 13,
  fontFamily: "inherit",
  color: BRAND.text,
  background: "#FFFFFF",
};

function asList(value) {
  return String(value || "")
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * GptWriterFlagCard
 * -----------------
 * The master-admin control for the Phase 6 feature flag.
 *
 * The flag lives in SystemConfig, defaults OFF, and is read and written only
 * through manageProposalWriterFlag — this card shows the state the server
 * resolved and submits a change; it never decides anything itself. Scope is
 * deliberately narrow: with the master switch on and both lists empty, only
 * master admins may use the writer.
 */
export default function GptWriterFlagCard() {
  const [config, setConfig] = useState(null);
  const [accounts, setAccounts] = useState("");
  const [emails, setEmails] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  const apply = (next) => {
    setConfig(next);
    setAccounts((next?.accounts || []).join("\n"));
    setEmails((next?.emails || []).join("\n"));
    setModel(next?.model || "");
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const response = await base44.functions.invoke("manageProposalWriterFlag", {});
        const data = response?.data || {};
        if (!mounted) return;
        if (data.error) setError(data.error);
        else apply(data.config || null);
      } catch (readError) {
        if (mounted) setError(readError?.response?.data?.error || readError?.message || "The flag could not be read.");
      }
    })();
    return () => { mounted = false; };
  }, []);

  const save = async (enabled) => {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const response = await base44.functions.invoke("manageProposalWriterFlag", {
        action: "set",
        enabled,
        accounts: asList(accounts),
        emails: asList(emails),
        model: model.trim() || null,
      });
      const data = response?.data || {};
      if (data.error) {
        setError(data.error);
        return;
      }
      apply(data.config || null);
      setNotice(enabled
        ? "The GPT proposal writer is switched on for the scope listed below."
        : "The GPT proposal writer is switched off. No writer action is shown and no provider call can be made.");
    } catch (saveError) {
      setError(saveError?.response?.data?.error || saveError?.message || "The change could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const enabled = config?.enabled === true;
  const scoped = (asList(accounts).length + asList(emails).length) > 0;

  return (
    <div style={{
      background: BRAND.card,
      border: `1px solid ${BRAND.border}`,
      borderRadius: 12,
      padding: 18,
      maxWidth: 720,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: BRAND.text }}>
          GPT proposal writer (controlled test)
        </div>
        <span style={{
          padding: "4px 10px", borderRadius: 999, border: `1px solid ${BRAND.border}`,
          fontSize: 11, fontWeight: 700, color: enabled ? "#213428" : BRAND.subtext, whiteSpace: "nowrap",
        }}>
          {config === null ? "Reading…" : enabled ? "ON" : "OFF"}
        </span>
      </div>

      <div style={{ fontSize: 13, color: BRAND.subtext, marginTop: 6, lineHeight: 1.5 }}>
        When off, nothing changes for anyone: no writer action appears and no provider call can be made.
        When on, only the accounts or emails listed here may use it — leave both lists empty to allow master
        admins only. The writer reads the saved Visual and Technical Report evidence alone, and every attempt
        is recorded permanently whether it succeeds or fails.
      </div>

      <div style={{ marginTop: 14 }}>
        <label style={LABEL} htmlFor="gpt-writer-accounts">Account IDs allowed</label>
        <textarea
          id="gpt-writer-accounts"
          style={{ ...FIELD, minHeight: 54 }}
          value={accounts}
          onChange={(event) => setAccounts(event.target.value)}
          placeholder="One account ID per line"
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={LABEL} htmlFor="gpt-writer-emails">Test user emails allowed</label>
        <textarea
          id="gpt-writer-emails"
          style={{ ...FIELD, minHeight: 54 }}
          value={emails}
          onChange={(event) => setEmails(event.target.value)}
          placeholder="One email per line"
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={LABEL} htmlFor="gpt-writer-model">Provider model override (optional)</label>
        <input
          id="gpt-writer-model"
          style={FIELD}
          value={model}
          onChange={(event) => setModel(event.target.value)}
          placeholder="Leave empty for the writer's default model"
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => save(true)}
          style={{
            padding: "9px 16px", borderRadius: 8, border: "none",
            background: BRAND.btn, color: BRAND.btnText, fontSize: 13, fontWeight: 600,
            cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
          }}
        >
          {scoped ? "Switch on for this scope" : "Switch on for master admins only"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => save(false)}
          style={{
            padding: "9px 16px", borderRadius: 8,
            background: "#FFFFFF", color: BRAND.text, border: `1px solid ${BRAND.border}`,
            fontSize: 13, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
          }}
        >
          Switch off
        </button>
        {config?.updated_by && (
          <span style={{ fontSize: 11, color: BRAND.subtext }}>
            Last changed by {config.updated_by}
          </span>
        )}
      </div>

      {notice && <div style={{ marginTop: 10, fontSize: 13, color: "#213428" }}>{notice}</div>}
      {error && <div style={{ marginTop: 10, fontSize: 13, color: BRAND.warning }}>{error}</div>}
    </div>
  );
}