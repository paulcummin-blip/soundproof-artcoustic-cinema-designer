/**
 * useAdiKnowledgeRecords
 * ----------------------
 * THE MASTER ADMIN'S VIEW OF WHAT ADI HAS LEARNED.
 *
 * WHY IT EXISTS. Learned knowledge has to be inspectable and correctable: a person
 * has to be able to read why a rationale was learned, approve it, reword it, merge a
 * duplicate, or turn it off. This hook reads the records and applies one curation
 * action at a time through the backend authority, then re-reads so the panel always
 * shows what is actually stored.
 *
 * Master-admin use only: the page that uses this hook sits behind the admin gate, and
 * the curation actions are refused by the backend for anyone else.
 */

import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

const KNOWLEDGE_LIMIT = 200;

export default function useAdiKnowledgeRecords() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const read = useCallback(async () => {
    try {
      const page = await base44.entities.AdiDesignKnowledge.list({ limit: KNOWLEDGE_LIMIT });
      setRecords(Array.isArray(page) ? page : (page?.items || []));
      setError(null);
    } catch (readError) {
      setError(readError?.message || 'The learned knowledge could not be read.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { read(); }, [read]);

  const applyAction = useCallback(async (action, payload = {}) => {
    setBusy(payload?.id || payload?.knowledge_key || action);
    setError(null);
    try {
      const response = await base44.functions.invoke('manageAdiDesignKnowledge', { action, ...payload });
      const data = response?.data || {};
      if (data.error) {
        setError(data.reason || data.error);
        return null;
      }
      await read();
      return data;
    } catch (actionError) {
      setError(actionError?.message || 'That change could not be applied.');
      return null;
    } finally {
      setBusy(null);
    }
  }, [read]);

  return { records, loading, error, busy, applyAction, reload: read };
}