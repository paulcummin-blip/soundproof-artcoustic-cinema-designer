import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import {
  getEducationVisitEpoch,
  subscribeEducationVisitEpoch,
} from './educationNewContentStore';

/**
 * useEducationNewContent — sidebar notification hook for the Education menu item.
 *
 * Returns true when there is at least one published Education document whose
 * new_content_at is newer than the current user's education_last_visited_at
 * (or the user has never visited Education). The comparison is per-user and
 * read fresh from the user's own record, so one user opening Education does
 * not clear the notification for another.
 *
 * Re-evaluates on mount, on route change, and whenever a user marks Education
 * visited (via the shared visit epoch), so the 'New' badge clears immediately
 * after a successful visit and reappears when a new document is published.
 */
export function useEducationNewContent() {
  const { user } = useAuth();
  const location = useLocation();
  const [visitEpoch, setVisitEpoch] = useState(() => getEducationVisitEpoch());
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => subscribeEducationVisitEpoch((e) => setVisitEpoch(e)), []);

  useEffect(() => {
    if (!user) {
      setHasNew(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [page, me] = await Promise.all([
          base44.entities.EducationDocument.filter(
            { published: true },
            { sort: '-new_content_at', limit: 1 },
          ),
          base44.auth.me().catch(() => null),
        ]);
        if (cancelled) return;
        const latest = (page?.items || [])[0];
        if (!latest || !latest.new_content_at) {
          setHasNew(false);
          return;
        }
        const lastVisited = me?.education_last_visited_at || null;
        if (!lastVisited) {
          setHasNew(true);
          return;
        }
        setHasNew(
          new Date(latest.new_content_at).getTime() > new Date(lastVisited).getTime(),
        );
      } catch {
        if (!cancelled) setHasNew(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, location.pathname, visitEpoch]);

  return hasNew;
}