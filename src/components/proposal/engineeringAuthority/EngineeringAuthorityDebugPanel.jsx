/**
 * EngineeringAuthorityDebugPanel.jsx
 * --------------------------------
 * Debug component for Stage 1 — Engineering Authority.
 *
 * Renders the complete Engineering Authority object as JSON
 * for inspection and verification. Can be added to any page
 * that has access to the required data.
 *
 * Usage:
 *   <EngineeringAuthorityDebugPanel
 *     project={project}
 *     version={version}
 *     analysisResult={analysisResult}
 *     completedBassAuthority={completedBassAuthority}
 *     completedBassPresentation={completedBassPresentation}
 *     designRating={designRating}
 *     placedSpeakers={placedSpeakers}
 *     seats={seats}
 *     proposalAssets={proposalAssets}
 *     brandAsset={brandAsset}
 *   />
 */

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Copy } from 'lucide-react';
import { buildEngineeringAuthority } from './index';

export default function EngineeringAuthorityDebugPanel({
  project,
  version,
  analysisResult,
  completedBassAuthority,
  completedBassPresentation,
  designRating,
  placedSpeakers,
  seats,
  primarySeatingPosition,
  proposalAssets,
  brandAsset,
  proposalMetadata,
  assumedLevels,
}) {
  const [expanded, setExpanded] = useState(true);
  const [activeSection, setActiveSection] = useState('all');
  const [copied, setCopied] = useState(false);

  const authority = useMemo(() => {
    try {
      return buildEngineeringAuthority({
        project,
        version,
        analysisResult,
        completedBassAuthority,
        completedBassPresentation,
        designRating,
        placedSpeakers,
        seats,
        primarySeatingPosition,
        proposalAssets,
        brandAsset,
        proposalMetadata,
        assumedLevels,
      });
    } catch (err) {
      return { error: err.message, stack: err.stack };
    }
  }, [project, version, analysisResult, completedBassAuthority, completedBassPresentation, designRating, placedSpeakers, seats, primarySeatingPosition, proposalAssets, brandAsset, proposalMetadata, assumedLevels]);

  const sections = ['all', 'project', 'room', 'system', 'rp22', 'bass', 'products', 'images', 'dealer', 'metadata'];

  const displayData = activeSection === 'all' ? authority : { [activeSection]: authority[activeSection] };

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(authority, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(authority, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `engineering-authority-${project?.name || 'project'}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{
      border: '1px solid #D9D5CE',
      borderRadius: 8,
      background: '#FAFAF8',
      margin: 16,
      fontFamily: 'monospace',
      fontSize: 12,
    }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          cursor: 'pointer',
          borderBottom: expanded ? '1px solid #D9D5CE' : 'none',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span style={{ fontWeight: 700, fontSize: 13, color: '#213428' }}>
            Engineering Authority Debug Panel
          </span>
          {authority?.schema_version && (
            <span style={{ fontSize: 10, color: '#625143', background: '#E8E5DE', padding: '2px 6px', borderRadius: 4 }}>
              v{authority.schema_version}
            </span>
          )}
        </div>
        {expanded && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={(e) => { e.stopPropagation(); handleCopy(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                border: '1px solid #D9D5CE', borderRadius: 4, background: '#FFF',
                fontSize: 11, cursor: 'pointer', color: '#213428',
              }}
            >
              <Copy size={12} /> {copied ? 'Copied!' : 'Copy JSON'}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleDownload(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                border: '1px solid #D9D5CE', borderRadius: 4, background: '#FFF',
                fontSize: 11, cursor: 'pointer', color: '#213428',
              }}
            >
              <Download size={12} /> Download
            </button>
          </div>
        )}
      </div>

      {expanded && (
        <>
          {/* Section tabs */}
          <div style={{ display: 'flex', gap: 4, padding: '8px 14px', flexWrap: 'wrap' }}>
            {sections.map((sec) => (
              <button
                key={sec}
                onClick={() => setActiveSection(sec)}
                style={{
                  padding: '3px 10px',
                  border: '1px solid #D9D5CE',
                  borderRadius: 4,
                  background: activeSection === sec ? '#213428' : '#FFF',
                  color: activeSection === sec ? '#FFF' : '#213428',
                  fontSize: 11,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {sec}
              </button>
            ))}
          </div>

          {/* JSON output */}
          <div style={{
            padding: 14,
            maxHeight: 600,
            overflow: 'auto',
            background: '#1B1A1A',
            color: '#E8E5DE',
          }}>
            {authority.error ? (
              <div style={{ color: '#FF6B6B' }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>ERROR: {authority.error}</div>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11 }}>{authority.stack}</pre>
              </div>
            ) : (
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
                {JSON.stringify(displayData, null, 2)}
              </pre>
            )}
          </div>
        </>
      )}
    </div>
  );
}