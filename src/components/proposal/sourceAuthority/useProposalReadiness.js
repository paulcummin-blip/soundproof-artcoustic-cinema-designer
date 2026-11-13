/**
 * useProposalReadiness
 * --------------------
 * Reads the readiness of EVERY selected version, from the ONE authority that
 * already exists in the app:
 *
 *   - the canonical saved PROJECT REPORT per project + version (ReportSnapshot),
 *     judged by the SAME fingerprint comparison the report page uses, so this
 *     gate and the report's own Current badge can never disagree. The legacy
 *     Visual and Technical Reports are retired and never consulted.
 *   - the version's calculated engineering result, read from the two durable
 *     forms of the same result: the PUBLISHED engineering publication
 *     (ProjectVersion.published_fingerprint → the publication) and the version's
 *     COMPLETED calculation authority (ProjectAnalysisCache.completed_by_fingerprint).
 *     A browser-session handoff is never consulted: the server cannot see one, so
 *     the table must never report Current on account of it.
 *
 * ONE authority: the derivation lives in proposalReadinessAuthority (mirrored by
 * base44/shared/proposalReadinessAuthority.js, which the server gate uses). The
 * panel, the blocking text, the Generate gate and the server therefore all state
 * the same verdict, for the same version, in the saved version's own name.
 *
 * It recalculates nothing and generates no report content. Reading only.
 *
 * @param {Object} params
 * @param {string|null} params.projectId
 * @param {Array<string>} params.versionIds — every selected version
 * @returns {{ rows, gate, loading, error }}
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import {
  buildDurableSnapshot,
  extractEngineeringSummary,
  fetchDurablePublication,
} from '@/components/engineering/versionedEngineeringAuthority';
import { currentSourceFingerprints } from '@/components/report/reportSnapshotAuthority';
import { readSeatPriorityFingerprint } from '@/components/state/designReviewHandoff';
import { readProjectAnalysisCacheRecord } from '@/components/state/projectReadCache';
import { subscribeReportSourceStored } from './reportSourceSignal';
import { selectCanonicalReportSnapshotsByKey } from '@/components/report/reportSnapshotCanonical';
import { selectCanonicalVersions } from '@/lib/canonicalVersionSelection';
import {
  engineeringDifferenceIsPresentationOnly,
  proposalEvidenceDifferenceIsSafe,
} from '@/components/report/designIdentityComparison';
import {
  READINESS_STATE,
  resolveCalculationAuthority,
  resolveSavedReportCell,
  resolveVersionReadinessRow,
  versionDisplayName,
} from './proposalReadinessAuthority';
import {
  resolveSpeakerDesignCell,
  selectStoredSpeakerDesign,
} from './speakerDesignChecklistReadiness';
import {
  getSpeakerDesignGenerationError,
  isPreparingSpeakerDesign,
  subscribeSpeakerDesignGenerationStatus,
} from '@/components/report/speakerDesign/speakerDesignGenerationStatus';

export function useProposalReadiness({ projectId = null, versionIds = [] } = {}) {
  const ids = useMemo(
    () => (Array.isArray(versionIds) ? versionIds.filter(Boolean) : []),
    [versionIds],
  );
  const idsKey = ids.join('|');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Bumped when a saved report lands, so the read below runs again and the table
  // shows the report that has just been generated rather than the state before it.
  const [refreshToken, setRefreshToken] = useState(0);
  /**
   * Read again from the same authorities, for the one retry a failed read
   * offers. The wizard's retry action is this, and nothing else: the read that
   * decides the table and the Generate button is a single read.
   */
  const retry = useCallback(() => setRefreshToken((value) => value + 1), []);

  useEffect(() => {
    if (!projectId) return undefined;
    return subscribeReportSourceStored((entry) => {
      if (entry?.projectId && String(entry.projectId) !== String(projectId)) return;
      setRefreshToken((value) => value + 1);
    });
  }, [projectId]);

  // A Speaker Design generation starting or finishing changes the checklist
  // cell from "Not generated" to "Preparing…" and back, so the readiness read
  // re-runs the moment the shared status store moves.
  useEffect(() => {
    if (!projectId) return undefined;
    return subscribeSpeakerDesignGenerationStatus(() => {
      setRefreshToken((value) => value + 1);
    });
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;

    if (!projectId || !idsKey) {
      setRows([]);
      setLoading(false);
      setError(null);
      return undefined;
    }

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const [projectRecords, versionRecords, snapshotPage, durableReads, cacheRecords, speakerDesignPage] = await Promise.all([
          // The project's own active-version pointer is the first authority the
          // shared canonical selection rule reads.
          base44.entities.Project.filter({ id: projectId }),
          base44.entities.ProjectVersion.filter({ project_id: projectId }),
          base44.entities.ReportSnapshot.filter(
            { project_id: projectId, version_id: { $in: ids } },
            { sort: '-generated_at', limit: 200 },
          ),
          // The durable published-engineering read, one per selected version,
          // shared with every other consumer of the authority (session-cached).
          Promise.all(ids.map((versionId) => fetchDurablePublication(projectId, versionId))),
          // The version's completed calculation authority — the calculated
          // engineering result a Technical Report is generated from. Read
          // through the same session-cached project read the report path uses.
          Promise.all(ids.map((versionId) => readProjectAnalysisCacheRecord(projectId, versionId))),
          // The version's stored Speaker Design PDF — the equipment checklist the
          // Project Report export already writes to Project Library beside the
          // report. Read from the records that exist: no second store is created
          // and reading exports nothing.
          base44.entities.ProjectAssetExport.filter(
            { project_id: projectId, document_type: 'speaker_design', version_id: { $in: ids } },
            { sort: '-exported_at', limit: 200 },
          ),
        ]);
        if (cancelled) return;

        // The ONE shared canonical selection rule decides which version records
        // count. byId resolves every record, including a preserved record the
        // canonical list excludes, so a version named by an older proposal still
        // resolves its own name and fingerprint.
        const canonical = selectCanonicalVersions({
          versions: Array.isArray(versionRecords) ? versionRecords : [],
          activeVersionId: projectRecords?.[0]?.active_version_id || null,
        });
        const versionsById = canonical.byId;

        // The CANONICAL saved report per version and report type — the same rule
        // the report pages, Project Library and the server gate use. Complete
        // evidence comes first, then the row frozen against the version's CURRENT
        // published authority, and only then the newest: a complete, evidence-
        // carrying report is never displaced by a newer duplicate that is stale or
        // carries no evidence, so a report the designer generated cannot stop being
        // usable because a second row was written later.
        const snapshotRows = Array.isArray(snapshotPage) ? snapshotPage : (snapshotPage?.items || []);
        const publishedFingerprintByVersionId = new Map(ids.map((versionId) => [
          versionId,
          versionsById.get(versionId)?.published_fingerprint || null,
        ]));
        const savedByKey = selectCanonicalReportSnapshotsByKey(snapshotRows, {
          currentFingerprintByVersion: publishedFingerprintByVersionId,
        });

        const liveSeatPriorityFingerprint = readSeatPriorityFingerprint(projectId);

        // The version's stored equipment checklist — the Speaker Design PDF
        // Project Library already holds for it. Read from the records that exist:
        // no second store is created and reading exports nothing.
        const speakerDesignRecords = Array.isArray(speakerDesignPage)
          ? speakerDesignPage
          : (speakerDesignPage?.items || []);

        // Whether each version's publication moved past a frozen document for
        // PRESENTATION ONLY, decided from the two publications' own frozen
        // physical facts (designIdentityComparison) — the same verdict the report
        // page applies, so the Library, the readiness table and the report page
        // can never disagree about one document. Asked for BOTH documents a version
        // states — its saved Project Report and its stored equipment checklist —
        // and only where that document's frozen authority and the version's current
        // publication actually differ; any doubt answers false and the strict
        // verdict stands.
        const frozenFingerprintFor = {
          project: (versionId) => savedByKey.get(`${versionId}::project`)
            ?.source_fingerprints?.engineeringFingerprint || null,
          speaker_design: (versionId) => selectStoredSpeakerDesign(speakerDesignRecords, versionId, projectId)
            ?.source_fingerprints?.engineeringFingerprint || null,
        };
        const presentationOnlyBySource = { project: new Map(), speaker_design: new Map() };
        // One durable read per frozen document, shared by every consumer of the
        // same fingerprint, so a checklist and a report frozen against the same
        // publication never cost two reads.
        const frozenPublicationReads = new Map();
        const readFrozenPublication = (versionId, fingerprint) => {
          const key = `${versionId}::${fingerprint}`;
          if (!frozenPublicationReads.has(key)) {
            frozenPublicationReads.set(key, fetchDurablePublication(projectId, versionId, {
              engineeringFingerprint: fingerprint,
            }));
          }
          return frozenPublicationReads.get(key);
        };
        await Promise.all(ids.flatMap((versionId, index) => (
          Object.entries(frozenFingerprintFor).map(async ([source, frozenFingerprintOf]) => {
            const frozenFingerprint = frozenFingerprintOf(versionId);
            const currentPublication = durableReads[index]?.publication || null;
            if (!frozenFingerprint || !currentPublication) return;
            if (frozenFingerprint === currentPublication.engineering_fingerprint) return;
            const frozenRead = await readFrozenPublication(versionId, frozenFingerprint);
            presentationOnlyBySource[source].set(
              versionId,
              source === 'project'
                ? proposalEvidenceDifferenceIsSafe(frozenRead?.publication, currentPublication)
                : engineeringDifferenceIsPresentationOnly(frozenRead?.publication, currentPublication),
            );
          })
        )));
        if (cancelled) return;

        const nextRows = ids.map((versionId, index) => {
          const version = versionsById.get(versionId) || null;
          const durable = durableReads[index] || null;
          // THE canonical saved Project Report — the only report source a
          // proposal is gated on. The legacy Visual and Technical Reports are
          // never consulted here.
          const savedProjectReport = savedByKey.get(`${versionId}::project`) || null;
          // The version's calculated engineering result: the publication when it
          // has one, otherwise the completed calculation authority of the SAME
          // design the saved Project Report was generated from.
          const calculationAuthority = resolveCalculationAuthority({
            cacheRecord: cacheRecords[index] || null,
            savedProjectReport,
          });
          // The current fingerprints come from the publication this version has
          // actually saved — the same values the server gate compares against.
          const durableSnapshot = durable?.publication
            ? buildDurableSnapshot({
              projectId,
              versionId,
              publication: durable.publication,
              designState: version?.design_state,
            })
            : null;
          const savedFingerprints = currentSourceFingerprints({
            authoritySnapshot: durableSnapshot,
            engineeringSummary: extractEngineeringSummary(durableSnapshot),
            liveSeatPriorityFingerprint,
          });
          const currentFingerprints = {
            ...savedFingerprints,
            // When the version has no publication to speak for it, the completed
            // calculation authority supplies its bass fingerprint — so a report is
            // compared against the design the version actually holds instead of
            // against nothing. A version WITH a publication is left exactly as it
            // was: its own publication states what the reports are judged against.
            calculationFingerprint: savedFingerprints.calculationFingerprint
              || (durable?.publication ? null : calculationAuthority?.fingerprint)
              || null,
          };

          const savedReportCell = resolveSavedReportCell({
            saved: savedProjectReport,
            currentFingerprints,
            presentationOnlyMove: presentationOnlyBySource.project.get(versionId) === true,
          });
          let speakerDesignCell = resolveSpeakerDesignCell({
            stored: selectStoredSpeakerDesign(speakerDesignRecords, versionId, projectId),
            currentEngineeringFingerprint: currentFingerprints.engineeringFingerprint,
            presentationOnlyMove: presentationOnlyBySource.speaker_design.get(versionId) === true,
            projectId,
            versionId,
          });

          // Overlay the shared generation status: a Speaker Design being stored
          // right now reads "Preparing…" instead of "Not generated", and a failed
          // attempt carries its real reason so the card can offer a Retry. The
          // stored-record verdict above is still the authority for Current; this
          // only shapes how a missing or stale checklist is presented while the
          // system is already handling it.
          const preparing = isPreparingSpeakerDesign(projectId, versionId);
          const generationError = getSpeakerDesignGenerationError(projectId, versionId);
          if (preparing) {
            speakerDesignCell = {
              ...speakerDesignCell,
              state: READINESS_STATE.CHECKING,
              status: 'Preparing…',
              checking: true,
              current: false,
              reason: null,
              error: null,
            };
          } else if (generationError && !speakerDesignCell.current) {
            speakerDesignCell = { ...speakerDesignCell, error: generationError };
          }

          const row = resolveVersionReadinessRow({
            versionId,
            versionName: versionDisplayName(version || { version_number: index + 1 }),
            versionNumber: version?.version_number ?? index + 1,
            cells: {
              project: savedReportCell,
              speaker_design: speakerDesignCell,
            },
          });
          // Two further facts, taken from the SAME reads that decided this row: the
          // state of the version's saved engineering publication, and whether its
          // completed assessment exists. They choose the ONE action the preparation
          // step offers; the designer never reads them.
          return {
            ...row,
            // The current engineering fingerprint, so the Proposal Centre's own
            // auto-preparation can ensure the Speaker Design for this exact design.
            engineeringFingerprint: currentFingerprints.engineeringFingerprint || null,
            // Whether a Speaker Design generation is in flight for this version,
            // and the plain reason the last attempt failed — read by the document
            // status card so it shows "Preparing documents" and a targeted Retry.
            speakerDesignPreparing: preparing,
            speakerDesignError: preparing ? null : (generationError || null),
            publicationStatus: durable?.status || null,
            hasCompletedAuthority: !!calculationAuthority,
          };
        });

        setRows(nextRows);
        setLoading(false);
      } catch (readError) {
        if (cancelled) return;
        console.warn('[proposalReadiness] read failed:', readError?.message || readError);
        setRows([]);
        setError(readError?.message || 'Readiness could not be read.');
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [projectId, idsKey, refreshToken]);

  return { rows, loading, error, retry };
}

export default useProposalReadiness;