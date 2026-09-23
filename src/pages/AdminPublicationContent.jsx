/**
 * AdminPublicationContent — Content Management section of the Admin Centre.
 *
 * Lists all publication content documents from the registry. The admin can
 * edit each document in a WYSIWYG editor, preview (desktop + print), save
 * drafts, publish, and restore previous versions.
 *
 * "About Sound Proof" is the first managed document. The architecture is
 * generic — future keys (rp22_explanation, bass_design_assistant_explanation,
 * proposal_introductions, etc.) appear automatically in the list.
 */
import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { PUBLICATION_CONTENT_REGISTRY, getDefaultContentHtml } from "@/components/publicationContent/defaultContent";
import WysiwygEditor from "@/components/publicationContent/WysiwygEditor";
import PublicationContentPreview from "@/components/publicationContent/PublicationContentPreview";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  bg: "rgb(248 248 247)",
  card: "#FFFFFF",
  btn: "#1B1A1A",
  btnText: "#FFFFFF",
  accent: "#213428",
};

export default function AdminPublicationContent() {
  const { user, isLoadingAuth } = useAuth();
  const isAdmin = user?.role === "admin";

  const [selectedKey, setSelectedKey] = useState(PUBLICATION_CONTENT_REGISTRY[0]?.content_key || null);
  const [records, setRecords] = useState({}); // content_key -> PublicationContent record
  const [draftHtml, setDraftHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [previewMode, setPreviewMode] = useState("desktop");
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  // Load all PublicationContent records
  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const all = await base44.entities.PublicationContent.list("-updated_date", 100);
      const map = {};
      (all || []).forEach((r) => {
        if (r.content_key) map[r.content_key] = r;
      });
      setRecords(map);
    } catch {
      setRecords({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) loadRecords();
  }, [isAdmin, loadRecords]);

  // When selection changes, load draft from record or default
  useEffect(() => {
    const record = selectedKey ? records[selectedKey] : null;
    if (record?.draft_html && record.draft_html.trim().length > 0) {
      setDraftHtml(record.draft_html);
    } else if (record?.published_html && record.published_html.trim().length > 0) {
      setDraftHtml(record.published_html);
    } else {
      setDraftHtml(getDefaultContentHtml(selectedKey));
    }
    setStatusMsg(null);
    setShowVersionHistory(false);
  }, [selectedKey, records]);

  const selectedRecord = selectedKey ? records[selectedKey] : null;
  const registryEntry = PUBLICATION_CONTENT_REGISTRY.find((e) => e.content_key === selectedKey);
  const publishedHtml = selectedRecord?.published_html || "";
  const isPublished = publishedHtml && publishedHtml.trim().length > 0;
  const isDirty = draftHtml !== (selectedRecord?.draft_html || publishedHtml || getDefaultContentHtml(selectedKey));

  // Save Draft
  const handleSaveDraft = async () => {
    if (!selectedKey) return;
    setSaving(true);
    setStatusMsg(null);
    try {
      const now = new Date().toISOString();
      if (selectedRecord) {
        const updated = await base44.entities.PublicationContent.update(selectedRecord.id, {
          draft_html: draftHtml,
          last_draft_saved_at: now,
        });
        setRecords((prev) => ({ ...prev, [selectedKey]: { ...prev[selectedKey], ...updated } }));
      } else {
        const created = await base44.entities.PublicationContent.create({
          content_key: selectedKey,
          title: registryEntry?.title || selectedKey,
          draft_html: draftHtml,
          last_draft_saved_at: now,
        });
        setRecords((prev) => ({ ...prev, [selectedKey]: created }));
      }
      setStatusMsg({ type: "ok", text: "Draft saved." });
    } catch (err) {
      setStatusMsg({ type: "error", text: "Failed to save draft." });
    } finally {
      setSaving(false);
    }
  };

  // Publish
  const handlePublish = async () => {
    if (!selectedKey) return;
    setPublishing(true);
    setStatusMsg(null);
    try {
      const now = new Date().toISOString();
      const publishedBy = user?.full_name || user?.email || "admin";
      const newVersionEntry = isPublished
        ? { html: publishedHtml, published_at: selectedRecord.last_published_at || now, published_by: selectedRecord.last_published_by || "" }
        : null;
      const newHistory = newVersionEntry
        ? [newVersionEntry, ...(selectedRecord.version_history || [])].slice(0, 50)
        : (selectedRecord.version_history || []);

      if (selectedRecord) {
        const updated = await base44.entities.PublicationContent.update(selectedRecord.id, {
          published_html: draftHtml,
          draft_html: draftHtml,
          last_published_at: now,
          last_published_by: publishedBy,
          last_draft_saved_at: now,
          version_history: newHistory,
        });
        setRecords((prev) => ({ ...prev, [selectedKey]: { ...prev[selectedKey], ...updated } }));
      } else {
        const created = await base44.entities.PublicationContent.create({
          content_key: selectedKey,
          title: registryEntry?.title || selectedKey,
          published_html: draftHtml,
          draft_html: draftHtml,
          last_published_at: now,
          last_published_by: publishedBy,
          last_draft_saved_at: now,
          version_history: [],
        });
        setRecords((prev) => ({ ...prev, [selectedKey]: created }));
      }
      setStatusMsg({ type: "ok", text: "Published. All consumers now show this content." });
    } catch (err) {
      setStatusMsg({ type: "error", text: "Failed to publish." });
    } finally {
      setPublishing(false);
    }
  };

  // Restore Previous Version
  const handleRestore = async (versionEntry) => {
    if (!selectedRecord || !versionEntry) return;
    setDraftHtml(versionEntry.html);
    setStatusMsg({ type: "ok", text: "Previous version loaded into editor. Review and Publish to make it live." });
    setShowVersionHistory(false);
  };

  // Revert draft to currently published (or default)
  const handleRevertDraft = () => {
    if (selectedRecord?.published_html && selectedRecord.published_html.trim().length > 0) {
      setDraftHtml(selectedRecord.published_html);
    } else {
      setDraftHtml(getDefaultContentHtml(selectedKey));
    }
    setStatusMsg({ type: "ok", text: "Reverted to current published content." });
  };

  if (isLoadingAuth) {
    return <div style={{ padding: 48, textAlign: "center", color: BRAND.subtext }}>Checking access…</div>;
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: BRAND.subtext, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 32 }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.text }}>Access Denied</div>
        <div style={{ fontSize: 14 }}>This page is restricted to admin users.</div>
        <a href="/Projects" style={{ marginTop: 8, padding: "10px 20px", borderRadius: 10, background: BRAND.btn, color: BRAND.btnText, fontSize: 14, textDecoration: "none" }}>Go to Projects</a>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, background: BRAND.bg, minHeight: "100vh", color: BRAND.text }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <a href="/admin" style={{ fontSize: 13, color: BRAND.subtext, textDecoration: "none" }}>← Back to Admin Dashboard</a>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, color: BRAND.text }}>Content Management</h1>
          <div style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4 }}>
            Publication content — the canonical source for all client-facing text
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 20, alignItems: "start" }}>
        {/* Left: document list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {PUBLICATION_CONTENT_REGISTRY.map((entry) => {
            const rec = records[entry.content_key];
            const hasCustom = rec?.published_html && rec.published_html.trim().length > 0;
            const hasDraft = rec?.draft_html && rec.draft_html.trim().length > 0 && rec.draft_html !== rec.published_html;
            const isActive = selectedKey === entry.content_key;
            return (
              <button
                key={entry.content_key}
                onClick={() => setSelectedKey(entry.content_key)}
                style={{
                  textAlign: "left",
                  padding: "14px 16px",
                  borderRadius: 10,
                  border: `1px solid ${isActive ? BRAND.accent : BRAND.border}`,
                  background: isActive ? "#fff" : "transparent",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.text }}>{entry.title}</div>
                <div style={{ fontSize: 11, color: BRAND.subtext, marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {hasCustom && <span style={{ color: BRAND.accent, fontWeight: 600 }}>● Published</span>}
                  {!hasCustom && <span style={{ color: BRAND.subtext }}>○ Default</span>}
                  {hasDraft && <span style={{ color: "#625143", fontWeight: 600 }}>● Draft</span>}
                </div>
              </button>
            );
          })}
        </div>

        {/* Right: editor + preview */}
        <div>
          {loading ? (
            <div style={{ padding: 48, textAlign: "center", color: BRAND.subtext }}>Loading…</div>
          ) : (
            <>
              {/* Status bar */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 16px", background: BRAND.card, border: `1px solid ${BRAND.border}`,
                borderRadius: 10, marginBottom: 16, flexWrap: "wrap", gap: 12,
              }}>
                <div style={{ fontSize: 13, color: BRAND.subtext }}>
                  {isPublished
                    ? <span>Currently showing <strong style={{ color: BRAND.accent }}>published content</strong>.</span>
                    : <span>Currently showing <strong>default content</strong> (no custom content published).</span>}
                  {selectedRecord?.last_published_at && (
                    <span style={{ marginLeft: 8 }}>Last published: {new Date(selectedRecord.last_published_at).toLocaleString("en-GB")}</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    onClick={handleRevertDraft}
                    disabled={!isDirty || saving || publishing}
                    style={{
                      padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                      border: `1px solid ${BRAND.border}`, background: "#fff", color: BRAND.text,
                      cursor: isDirty && !saving && !publishing ? "pointer" : "not-allowed", opacity: isDirty ? 1 : 0.5,
                    }}
                  >
                    Revert
                  </button>
                  <button
                    onClick={handleSaveDraft}
                    disabled={!isDirty || saving || publishing}
                    style={{
                      padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                      border: `1px solid ${BRAND.border}`, background: "#fff", color: BRAND.text,
                      cursor: isDirty && !saving && !publishing ? "pointer" : "not-allowed", opacity: isDirty ? 1 : 0.5,
                    }}
                  >
                    {saving ? "Saving…" : "Save Draft"}
                  </button>
                  <button
                    onClick={handlePublish}
                    disabled={publishing || saving}
                    style={{
                      padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700,
                      border: "none", background: BRAND.accent, color: "#fff",
                      cursor: !publishing && !saving ? "pointer" : "not-allowed", opacity: publishing || saving ? 0.7 : 1,
                    }}
                  >
                    {publishing ? "Publishing…" : "Publish"}
                  </button>
                </div>
              </div>

              {statusMsg && (
                <div style={{
                  padding: "10px 16px", marginBottom: 16, borderRadius: 8,
                  background: statusMsg.type === "ok" ? "#e8f0e8" : "#f0e0e0",
                  color: statusMsg.type === "ok" ? BRAND.accent : "#B23A3A",
                  fontSize: 13, fontWeight: 600,
                }}>
                  {statusMsg.text}
                </div>
              )}

              {/* Version history toggle */}
              {selectedRecord?.version_history && selectedRecord.version_history.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <button
                    onClick={() => setShowVersionHistory(!showVersionHistory)}
                    style={{
                      padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                      border: `1px solid ${BRAND.border}`, background: "#fff", color: BRAND.subtext, cursor: "pointer",
                    }}
                  >
                    {showVersionHistory ? "Hide" : "Show"} Version History ({selectedRecord.version_history.length})
                  </button>
                  {showVersionHistory && (
                    <div style={{ marginTop: 8, border: `1px solid ${BRAND.border}`, borderRadius: 8, background: "#fff", overflow: "hidden" }}>
                      {selectedRecord.version_history.map((v, i) => (
                        <div
                          key={i}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "10px 16px", borderBottom: i < selectedRecord.version_history.length - 1 ? `1px solid ${BRAND.border}` : "none",
                          }}
                        >
                          <div style={{ fontSize: 12, color: BRAND.subtext }}>
                            {v.published_at ? new Date(v.published_at).toLocaleString("en-GB") : "—"}
                            {v.published_by ? ` by ${v.published_by}` : ""}
                          </div>
                          <button
                            onClick={() => handleRestore(v)}
                            style={{
                              padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                              border: `1px solid ${BRAND.border}`, background: "#fff", color: BRAND.text, cursor: "pointer",
                            }}
                          >
                            Restore
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Preview mode toggle */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <button
                  onClick={() => setPreviewMode("desktop")}
                  style={{
                    padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 700,
                    border: `1px solid ${previewMode === "desktop" ? BRAND.accent : BRAND.border}`,
                    background: previewMode === "desktop" ? BRAND.accent : "#fff",
                    color: previewMode === "desktop" ? "#fff" : BRAND.text, cursor: "pointer",
                  }}
                >
                  Desktop Preview
                </button>
                <button
                  onClick={() => setPreviewMode("print")}
                  style={{
                    padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 700,
                    border: `1px solid ${previewMode === "print" ? BRAND.accent : BRAND.border}`,
                    background: previewMode === "print" ? BRAND.accent : "#fff",
                    color: previewMode === "print" ? "#fff" : BRAND.text, cursor: "pointer",
                  }}
                >
                  Print Preview
                </button>
              </div>

              {/* Editor + Preview side by side */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.text, marginBottom: 8 }}>Editor</div>
                  <WysiwygEditor
                    value={draftHtml}
                    onChange={setDraftHtml}
                    placeholder="Write the About Sound Proof content…"
                    minHeight={400}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.text, marginBottom: 8 }}>Live Preview ({previewMode})</div>
                  <div style={{
                    border: `1px solid ${BRAND.border}`, borderRadius: 10, background: "#f5f5f4",
                    padding: 16, maxHeight: 600, overflow: "auto",
                  }}>
                    <PublicationContentPreview html={draftHtml} mode={previewMode} />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}