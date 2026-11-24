import {useCanonicalProject} from "@/components/state/projectHydrationStore";
import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

const BRAND = {
  text: '#1B1A1A',
  subtext: '#3E4349',
  border: '#DCDBD6',
  card: '#FFFFFF',
  btn: '#1B1A1A',
  btnText: '#FFFFFF',
};

export default function AlertRecipientSettings() {
  const project = useCanonicalProject();
  const [enabled, setEnabled] = useState(false);
  const [recipients, setRecipients] = useState([]);
  const [newRecipient, setNewRecipient] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState(null);
  const [savedAt, setSavedAt] = useState(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await base44.functions.invoke('manageSystemHealthConfig', { action: 'get' });
      const data = response?.data || {};
      setEnabled(data.alerts_enabled === true);
      setRecipients(Array.isArray(data.alert_recipients) ? data.alert_recipients : []);
    } catch (err) {
      setError(err?.message || 'Failed to load alert configuration.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const addRecipient = () => {
    const email = newRecipient.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    if (recipients.includes(email)) return;
    setRecipients([...recipients, email]);
    setNewRecipient('');
  };

  const removeRecipient = (email) => {
    setRecipients(recipients.filter((r) => r !== email));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await base44.functions.invoke('manageSystemHealthConfig', {
        action: 'update',
        alerts_enabled: enabled,
        alert_recipients: recipients,
      });
      setSavedAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      setError(err?.message || 'Failed to save alert configuration.');
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    setError(null);
    setTestResult(null);
    try {
      const response = await base44.functions.invoke('manageSystemHealthConfig', { action: 'test', project_id:project.projectId || null, version_id:project.identity?.activeVersionId || null });
      const result = response?.data || {};
      if (!result.recorded || result.notification_status !== 'sent') {
        setError(`Test alert was not sent (${result.notification_status || 'recording failed'}). Check System Health for details.`);
      } else {
        setTestResult(`${result.reference}: email accepted for sending to the saved recipients. Check your inbox to confirm delivery.`);
      }
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Test alert failed.');
    } finally { setTesting(false); }
  };

  if (loading) {
    return (
      <div style={{
        background: BRAND.card, border: `1px solid ${BRAND.border}`,
        borderRadius: 12, padding: 24, marginBottom: 20, textAlign: 'center',
        fontSize: 13, color: BRAND.subtext,
      }}>
        Loading alert configuration…
      </div>
    );
  }

  return (
    <div style={{
      background: BRAND.card, border: `1px solid ${BRAND.border}`,
      borderRadius: 12, marginBottom: 20,
    }}>
      <div style={{
        padding: '14px 16px', borderBottom: `1px solid ${BRAND.border}`,
        fontSize: 14, fontWeight: 700, color: BRAND.text,
      }}>
        Alert Recipients
      </div>

      <div style={{ padding: 16 }}>
        {/* Enable toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontSize: 13, color: BRAND.text, cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            Enable immediate email alerts for significant incidents
          </label>
        </div>

        {/* Current recipients */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.subtext, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            Nominated recipients ({recipients.length})
          </div>
          {recipients.length === 0 ? (
            <div style={{ fontSize: 12, color: BRAND.subtext, fontStyle: 'italic' }}>
              No recipients configured. No alert emails will be sent until at least one recipient is added.
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {recipients.map((email) => (
                <span key={email} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px', borderRadius: 999, fontSize: 12,
                  background: '#F5F4F0', border: `1px solid ${BRAND.border}`, color: BRAND.text,
                }}>
                  {email}
                  <button
                    onClick={() => removeRecipient(email)}
                    style={{
                      border: 'none', background: 'none', cursor: 'pointer',
                      color: '#B23A3A', fontSize: 14, padding: 0, lineHeight: 1,
                    }}
                  >×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Add recipient */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            type="email"
            value={newRecipient}
            onChange={(e) => setNewRecipient(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addRecipient(); }}
            placeholder="admin@example.com"
            style={{
              flex: 1, padding: '8px 12px', fontSize: 13,
              border: `1px solid ${BRAND.border}`, borderRadius: 6,
              fontFamily: 'inherit', color: BRAND.text,
            }}
          />
          <button
            onClick={addRecipient}
            style={{
              padding: '8px 16px', fontSize: 12, fontWeight: 600,
              background: 'transparent', color: BRAND.text,
              border: `1px solid ${BRAND.border}`, borderRadius: 6, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Add
          </button>
        </div>

        <p style={{fontSize:12,color:BRAND.subtext}}>Test context: {project.identity?.name || 'No active project'}{project.identity?.clientName ? ` / ${project.identity.clientName}` : ''}. Uses saved recipients.</p>
        {/* Save */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={save}
            disabled={saving}
            style={{
              padding: '10px 20px', fontSize: 12, fontWeight: 700,
              background: BRAND.btn, color: BRAND.btnText, border: 'none',
              borderRadius: 6, cursor: saving ? 'default' : 'pointer',
              opacity: saving ? 0.6 : 1, fontFamily: 'inherit',
              textTransform: 'uppercase', letterSpacing: '0.08em',
            }}
          >
            {saving ? 'Saving…' : 'Save configuration'}
          </button>
          <button type="button" onClick={sendTest} disabled={testing || saving}
            style={{ padding: '10px 20px', fontSize: 12, border: `1px solid ${BRAND.border}`, borderRadius: 6, background: 'white', color: BRAND.text, cursor: testing ? 'default' : 'pointer' }}>
            {testing ? 'Sending test…' : 'Send test alert'}
          </button>
          {savedAt && !error && (
            <span style={{ fontSize: 12, color: '#213428' }}>✓ Saved at {savedAt}</span>
          )}
        </div>

        {testResult && <p role="status" style={{ fontSize: 12, color: '#213428' }}>{testResult}</p>}

        {error && (
          <div style={{ marginTop: 10, padding: 10, background: '#FBEAEA', borderRadius: 8, fontSize: 12, color: '#B23A3A' }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 12, fontSize: 11, color: BRAND.subtext, lineHeight: 1.5 }}>
          Alert emails are sent immediately when a significant incident is first recorded.
          Repeated occurrences are grouped and do not trigger duplicate alerts.
          Recipients must be registered Sound Proof app users for delivery.
        </div>
      </div>
    </div>
  );
}